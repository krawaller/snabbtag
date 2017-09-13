import { h, Component } from 'preact';
import { TrainIcon } from './Icons';

export default class Train extends Component {
  constructor(props) {
    super(props);

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
    this.subscription = this.props.api.subscribeTrain(
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
            this._pageContent.scrollTop +=
              stationRect.top -
              pageContentRect.top -
              pageContentRect.height / 2;
          } else {
            this._pageContent.scrollTop +=
              pos +
              (timelineRect.top - pageContentRect.top) -
              pageContentRect.height / 2;
          }
          this._hasScrolled = true;
        }
      }
    }
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
          {name && (
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
            </div>
          )}
        </div>
        <div class="timeline-item-divider" />
        <div class="timeline-item-content">
          <div class="timeline-item-inner">
            <div class="name hide-when-empty mute-when-departed">
              {name && (
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
                    .map(deviation => (
                      <span>
                        <div
                          class={`chip ${/inställ|ersätter/i.test(deviation)
                            ? 'color-red'
                            : ''}`}
                        >
                          <div class="chip-label">{deviation}</div>
                        </div>{' '}
                      </span>
                    ))}
                </div>
              )}
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
                <div>{announcements.map(this.renderAnnouncement)}</div>
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
