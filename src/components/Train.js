import { h, Component } from 'preact';
import { TrainIcon } from './Icons';

export default class Train extends Component {
  constructor(props) {
    super(props);
    this.api = props.api;
    this.state = {
      announcements: [],
      date: props.date || new Intl.DateTimeFormat('sv-SE').format(new Date()),
      hasPositionedTrainMarker: false,
      trainY: 29
    };
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevState.announcements !== this.state.announcements) {
      this.updateTrainMarker();
    }

    if (
      !this.state.hasPositionedTrainMarker &&
      prevState.trainY !== this.state.trainY
    ) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.setState({ hasPositionedTrainMarker: true });
        });
      });
    }
  }

  componentDidMount() {
    this.subscription = this.subscribeTrain(
      this.props.train,
      this.state.date,
      ({ announcements }) =>
        this.setState({
          announcements
        })
    );
    document.title = `Tåg ${this.props.train}`;
  }

  componentWillUnmount() {
    this.subscription.cancel();
  }

  updateTrainMarker() {
    if (this._timeline) {
      const at = Array.prototype.slice
        .call(
          this._timeline.querySelectorAll(
            '.timeline-item.arrived, .timeline-item:first-child'
          ),
          -1
        )
        .pop();
      const station = this._timeline.querySelector(
        `.timeline-item[data-name="${this.props.station}"]`
      );
      if (at) {
        const departed = at.classList.contains('departed');
        const rect = at.getBoundingClientRect();

        const pos =
          rect.top +
          rect.height / (departed ? 1 : 2) -
          this._timeline.getBoundingClientRect().top;

        this.setState({ trainY: pos });

        if (!this._hasScrolled) {
          const stationRect = station && station.getBoundingClientRect();
          const timelineRect = this._timeline.getBoundingClientRect();
          const pageContentRect = this._pageContent.getBoundingClientRect();

          if (station) {
            const before = this._pageContent.scrollTop;
            this._pageContent.scrollTop +=
              stationRect.top -
              pageContentRect.top -
              pageContentRect.height / 2;
            const after = this._pageContent.scrollTop;
          } else {
            const markerPosRelativeToPageContent =
              pos + (timelineRect.top - pageContentRect.top);

            this._pageContent.scrollTop +=
              markerPosRelativeToPageContent - pageContentRect.height / 2;
          }
          this._hasScrolled = true;
        }
      }
    }
  }

  fetchTrain(train, date, lastModified) {
    return this.api
      .query(
        `
      <QUERY objecttype="TrainAnnouncement" orderby="AdvertisedTimeAtLocation" lastmodified="TRUE">
        <INCLUDE>LocationSignature</INCLUDE>
        <INCLUDE>ActivityType</INCLUDE>
        <INCLUDE>AdvertisedTimeAtLocation</INCLUDE>
        <INCLUDE>EstimatedTimeAtLocation</INCLUDE>
        <INCLUDE>TimeAtLocation</INCLUDE>
        <INCLUDE>TrackAtLocation</INCLUDE>
        <INCLUDE>Canceled</INCLUDE>
        <INCLUDE>Deviation</INCLUDE>
        <FILTER>
          <EQ name="AdvertisedTrainIdent" value="${train}" />
          <EQ name="Advertised" value="TRUE" />
          <EQ name="ScheduledDepartureDateTime" value="${date}" />
          ${lastModified
            ? `<GT name="ModifiedTime" value="${lastModified}"/>`
            : ''}
        </FILTER>
      </QUERY>`
      )
      .then(
        ({
          TrainAnnouncement = [],
          INFO: {
            LASTMODIFIED: { '@datetime': lastModified = false } = {}
          } = {}
        }) => ({ announcements: TrainAnnouncement, lastModified })
      );
  }

  subscribeTrain(train, date, callback) {
    let checkTimeout;
    let cancelled = false;
    let formattedAnnouncementsBySign = {};
    let currentLastModified;
    let isChecking = false;
    let retryCount = 0;

    const handleVisibilityChange = () => {
      if (!document.hidden) check();
    };

    const cancel = () => {
      cancelled = true;
      clearTimeout(checkTimeout);
      removeEventListener('visibilitychange', handleVisibilityChange);
      removeEventListener('online', check);
    };

    const check = () => {
      if (isChecking) return;
      isChecking = true;
      this.fetchTrain(train, date, currentLastModified).then(
        ({ announcements, lastModified }) => {
          if (cancelled) return;
          isChecking = false;
          retryCount = 0;

          if (!document.hidden && navigator.onLine)
            checkTimeout = setTimeout(check, this.api.CHECK_INTERVAL);

          if (lastModified === false || lastModified === currentLastModified)
            return;

          formattedAnnouncementsBySign = announcements.reduce(
            (all, announcement, i, arr) => {
              const current = all[announcement.LocationSignature] || {};
              const rawDeviations = (current.deviations || [])
                .concat(announcement.Deviation || []);

              all[announcement.LocationSignature] = Object.assign(current, {
                sign: announcement.LocationSignature,
                name: this.api.getStationBySign(announcement.LocationSignature),
                track: announcement.TrackAtLocation,
                deviations: Array.from(
                  new Set(
                    rawDeviations.filter(
                      deviation =>
                        !/^inställ|^prel\. tid|^spårändrat/i.test(deviation)
                    )
                  )
                ),
                trackChanged: !!rawDeviations.find(deviation =>
                  /^spårändrat/i.test(deviation)
                ),
                [announcement.ActivityType === 'Avgang'
                  ? 'departure'
                  : 'arrival']: {
                  date: this.api.extractDate(
                    announcement.AdvertisedTimeAtLocation
                  ),
                  advertised: this.api.extractTime(
                    announcement.AdvertisedTimeAtLocation
                  ),
                  estimated: this.api.extractTime(
                    announcement.EstimatedTimeAtLocation
                  ),
                  actual: this.api.extractTime(announcement.TimeAtLocation),
                  happened:
                    !!announcement.TimeAtLocation ||
                    arr
                      .slice(i + 1)
                      .some(({ TimeAtLocation }) => TimeAtLocation),
                  cancelled: !!announcement.Canceled,
                  deviations: announcement.Deviation,
                  preliminary:
                    !announcement.TimeAtLocation &&
                    !!(announcement.Deviation || [])
                      .find(deviation => /^prel\. tid/i.test(deviation))
                }
              });
              return all;
            },
            formattedAnnouncementsBySign
          );

          currentLastModified = lastModified;
          const formattedAnnouncements = Object.values(
            formattedAnnouncementsBySign
          );

          if (
            (formattedAnnouncements[formattedAnnouncements.length - 1]
              .arrival || {}).happened
          )
            cancel();

          callback({ announcements: formattedAnnouncements });
        },
        error => {
          isChecking = false;
          if (retryCount++ < this.api.MAX_RETRY_COUNT)
            checkTimeout = setTimeout(check, (1 << retryCount) * 1000);
        }
      );
    };
    check();

    addEventListener('visibilitychange', handleVisibilityChange);
    addEventListener('online', check);
    return { cancel };
  }

  renderAnnouncement = (
    {
      arrival = {},
      departure = {},
      track,
      sign,
      name,
      cancelled,
      deviations,
      trackChanged
    } = {},
    i
  ) => {
    const hasArrival = !!arrival.advertised;
    const hasDeparture = !!departure.advertised;

    const arrivalDeviates =
      hasArrival &&
      ((arrival.actual && arrival.actual !== arrival.advertised) ||
        !!arrival.estimated);
    const arrivalIsLate =
      arrivalDeviates && arrival.actual > arrival.advertised;
    const departureDeviates =
      hasDeparture &&
      ((departure.actual && departure.actual !== departure.advertised) ||
        !!departure.estimated);
    const departureIsLate =
      departureDeviates && departure.actual > departure.advertised;

    const cancelledDeviation =
      arrival.cancelled && departure.cancelled
        ? 'Inställt'
        : arrival.cancelled
          ? 'Inställd ankomst'
          : departure.canceleld ? 'Inställd avgång' : null;

    return (
      <div
        class={`timeline-item ${((arrival.happened || departure.happened) &&
          'arrived') ||
          ''} ${(departure.happened && 'departed') || ''}`}
        data-name={name}
      >
        <div class="timeline-item-date time hide-when-empty mute-when-departed">
          {name &&
            <div class="row">
              <div class="col arrivals">
                <div
                  class={`original ${arrivalDeviates ? 'has-deviation' : ''}`}
                >
                  {arrival.advertised}
                </div>
                <div class={`actual ${arrivalIsLate ? 'late' : ''}`}>
                  {arrivalDeviates && (arrival.actual || arrival.estimated)}
                  {arrival.preliminary ? '*' : ''}
                </div>
              </div>
              <div class="col departures">
                <div
                  class={`original ${departureDeviates ? 'has-deviation' : ''}`}
                >
                  {departure.advertised}
                </div>
                <div class={`actual ${departureIsLate ? 'late' : ''}`}>
                  {departureDeviates &&
                    (departure.actual || departure.estimated)}
                  {departure.preliminary ? '*' : ''}
                </div>
              </div>
            </div>}
        </div>
        <div class="timeline-item-divider" />
        <div class="timeline-item-content">
          <div class="timeline-item-inner">
            <div class="name hide-when-empty mute-when-departed">
              {name &&
                <div>
                  <a
                    href={this.props.getUrl('station', {
                      station: name
                    })}
                  >
                    {name}
                  </a>{' '}
                  {[cancelledDeviation]
                    .concat(deviations)
                    .filter(Boolean)
                    .map(deviation =>
                      <span>
                        <div
                          class={`chip ${/inställ|ersätter/i.test(deviation)
                            ? 'color-red'
                            : ''}`}
                        >
                          <div class="chip-label">
                            {deviation}
                          </div>
                        </div>{' '}
                      </span>
                    )}
                </div>}
            </div>
            &nbsp;
            <div class="track hide-when-empty mute-when-departed">
              <span
                class={`${trackChanged ? 'track-changed' : ''} ${false
                  ? 'track-cancelled'
                  : ''}`}
              >
                {track}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  render(
    { train, to },
    {
      date,
      hasPositionedTrainMarker,
      announcements = Array.from(new Array(15)),
      trainY
    }
  ) {
    return (
      <div class="view navbar-through">
        <div class="navbar" onClick={this.props.onClose}>
          <div class="navbar-inner hide-when-empty">
            <div class="left">
              <a
                class="back link"
                href={this.props.getUrl(
                  this.props.station ? 'station' : 'stations'
                )}
                data-pop
              >
                <i class="icon icon-back" />
                <span>Tillbaka</span>
              </a>
            </div>
            <div class="center sliding">
              Tåg {train}, {this.props.getNearbyHumanDate(date) || date}
            </div>
            <div class="right" />
          </div>
        </div>
        <div class="page train-view">
          <div
            class="page-content hide-when-empty"
            ref={pageContent => (this._pageContent = pageContent)}
          >
            <div class="list-block">
              <div class="list-group-title">
                <div class="time">
                  <div class="row">
                    <div class="col">Ank</div>
                    <div class="col">Avg</div>
                  </div>
                </div>
                <div class="station-title">Station</div>
                <div class="track-title">Spår</div>
              </div>
              <div
                class="timeline"
                ref={timeline => (this._timeline = timeline)}
              >
                <div>
                  {announcements.map(this.renderAnnouncement)}
                </div>
                <span
                  class={`train-marker ${hasPositionedTrainMarker
                    ? 'animated'
                    : ''}`}
                  style={`transform: translate3d(0, ${trainY}px, 0)`}
                >
                  <TrainIcon />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
