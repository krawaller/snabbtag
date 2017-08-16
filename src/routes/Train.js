import { h, Component } from 'preact';

export default class TrainAnnouncement extends Component {
  constructor(props) {
    super(props);
    console.log({props})
    this.api = props.api;
    this.state = {
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
      setTimeout(() => {
        this.setState({ hasPositionedTrainMarker: true });
      }, 100);
    }
  }

  componentDidMount() {
    this.subscription = this.subscribeTrain(
      this.props.train,
      this.state.date,
      announcements =>
        this.setState({
          announcements
        })
    );

    // this.refreshInterval = setInterval(this.refresh, 30000);

    // const interval = setInterval(() => {
    //   const announcements = this.state.announcements.concat();
    //   const a = announcements.find(
    //     a =>
    //       (a && a.arrival && a.arrival.happened === false) ||
    //       (a && a.departure && a.departure.happened === false)
    //   );

    //   if (a) {
    //     if (a && a.arrival && a.arrival.happened === false)
    //       a.arrival.happened = true;
    //     else if (a && a.departure && a.departure.happened === false)
    //       a.departure.happened = true;

    //     if (a && a.arrival && !a.arrival.estimated) {
    //       a.arrival.estimated = a.arrival.advertised.replace(/\d$/, '7');
    //     }

    //     this.setState({
    //       announcements
    //     });
    //   } else clearInterval(interval);
    // }, 1000);
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
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', check);
    };

    const check = () => {
      if (isChecking) return;
      isChecking = true;
      this.fetchTrain(train, date, currentLastModified).then(
        ({ announcements, lastModified }) => {
          if (cancelled) return;
          isChecking = false;
          retryCount = 0;

          if (!document.hidden && window.navigator.onLine)
            setTimeout(check, this.api.CHECK_INTERVAL);

          if (lastModified === false || lastModified === currentLastModified)
            return;

          formattedAnnouncementsBySign = announcements.reduce(
            (all, announcement, i, arr) => {
              all[announcement.LocationSignature] = Object.assign(
                all[announcement.LocationSignature] || {},
                {
                  sign: announcement.LocationSignature,
                  name: this.api.getStationBySign(
                    announcement.LocationSignature
                  ),
                  track: announcement.TrackAtLocation,
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
                    deviations: announcement.Deviation
                  }
                }
              );
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

          callback(formattedAnnouncements);
        },
        error => {
          isChecking = false;
          if (retryCount++ < this.api.MAX_RETRY_COUNT)
            setTimeout(check, (1 << retryCount) * 1000);
        }
      );
    };
    check();

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', check);
    return { cancel };
  }

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
                  {announcements.map(
                    (
                      {
                        arrival = {},
                        departure = {},
                        track,
                        sign,
                        name,
                        cancelled
                      } = {},
                      i
                    ) => {
                      const { arrival: { date: lastDate } = {} } =
                        announcements[i - 1] || {};

                      const changedDate =
                        arrival.date && lastDate && arrival.date !== lastDate;

                      const hasArrival = !!arrival.advertised;
                      const hasDeparture = !!departure.advertised;

                      const arrivalDeviates =
                        hasArrival &&
                        ((arrival.actual &&
                          arrival.actual !== arrival.advertised) ||
                          !!arrival.estimated);
                      const arrivalIsLate =
                        arrivalDeviates && arrival.actual > arrival.advertised;
                      const departureDeviates =
                        hasDeparture &&
                        ((departure.actual &&
                          departure.actual !== departure.advertised) ||
                          !!departure.estimated);
                      const departureIsLate =
                        departureDeviates &&
                        departure.actual > departure.advertised;

                      const cancelledDeviation =
                        arrival.cancelled && departure.cancelled
                          ? 'Inställt'
                          : arrival.cancelled
                            ? 'Inställd ankomst'
                            : departure.canceleld ? 'Inställd avgång' : null;
                      const deviationSet = new Set(
                        [cancelledDeviation]
                          .concat(arrival.deviations || [])
                          .concat(departure.deviations || [])
                          .filter(Boolean)
                      );
                      if (
                        cancelledDeviation &&
                        cancelledDeviation !== 'Inställt'
                      )
                        deviationSet.delete('Inställt');
                      const deviations = Array.from(deviationSet);

                      return (
                        <div
                          class={`timeline-item ${((arrival.happened ||
                            departure.happened) &&
                            'arrived') ||
                            ''} ${(departure.happened && 'departed') || ''}`}
                          data-name={name}
                        >
                          <div class="timeline-item-date time hide-when-empty mute-when-departed">
                            {name &&
                              <div class="row">
                                <div class="col arrivals">
                                  <div
                                    class={`original ${arrivalDeviates
                                      ? 'has-deviation'
                                      : ''}`}
                                  >
                                    {arrival.advertised}
                                  </div>
                                  <div
                                    class={`actual ${arrivalIsLate
                                      ? 'late'
                                      : ''}`}
                                  >
                                    {arrivalDeviates &&
                                      (arrival.actual || arrival.estimated)}
                                  </div>
                                </div>
                                <div class="col departures">
                                  <div
                                    class={`original ${departureDeviates
                                      ? 'has-deviation'
                                      : ''}`}
                                  >
                                    {departure.advertised}
                                  </div>
                                  <div
                                    class={`actual ${departureIsLate
                                      ? 'late'
                                      : ''}`}
                                  >
                                    {departureDeviates &&
                                      (departure.actual || departure.estimated)}
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
                                    {deviations.map(deviation =>
                                      <span>
                                        <div
                                          class={`chip ${/inställ|ersätter/i.test(
                                            deviation
                                          )
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
                                {track}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
                <span
                  class={`train-marker ${hasPositionedTrainMarker
                    ? 'animated'
                    : ''}`}
                  style={`transform: translate3d(0, ${trainY}px, 0)`}
                >
                  <svg
                    width="25"
                    height="25"
                    viewBox="0 0 50 50"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M25 50c13.807 0 25-11.193 25-25S38.807 0 25 0 0 11.193 0 25s11.193 25 25 25zm-2.047-17.828v-18.17c0-1.106.888-2.002 2-2.002 1.104 0 2 .902 2 2v18.172l6.54-6.54c.778-.78 2.037-.782 2.824.004.78.78.783 2.045.003 2.825l-9.906 9.907c-.412.412-.958.608-1.498.584-.515.005-1.03-.19-1.424-.583l-9.907-9.906c-.78-.778-.783-2.037.004-2.824.78-.78 2.044-.783 2.824-.003l6.54 6.54z"
                      fill="#4cd964"
                      fill-rule="evenodd"
                    />
                  </svg>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
