import { h, Component } from 'preact';
import { LocateIcon, FavoriteIcon } from './Icons';

//FIXME: sticky chrome headers
//FIXME: latest status?
//FIXME: stable list animations
//FIXME: check api burst after sleep

export default class Station extends Component {
  constructor(props) {
    super(props);

    this.state = {
      announcements: [],
      announcementsLoading: true,
      hasUnfilteredAnnouncements: false,
      isLocating: false
    };
    this.hasScrolled = false;
  }

  componentWillUnmount() {
    if (this.subscription) this.subscription.cancel();
  }

  componentDidMount() {
    this.updateStationSubscription();
    document.title = this.props.station;
  }

  componentDidUpdate(prevProps, prevState) {
    if (
      prevProps.station !== this.props.station ||
      prevProps.showingDepartures !== this.props.showingDepartures ||
      prevProps.filter !== this.props.filter
    ) {
      this.updateStationSubscription();
    }

    if (!this.hasScrolled && !this.state.announcementsLoading) {
      this.base.querySelector('.page-content').scrollTop = this.props.scrollTop;
      this.hasScrolled = true;
    }
  }

  updateStationSubscription() {
    this.setState({
      announcements: [],
      announcementsLoading: true
    });

    if (this.subscription) this.subscription.cancel();
    this.subscription = this.props.api.subscribeStation(
      this.props,
      ({ announcements, hasUnfilteredAnnouncements }) =>
        this.setState({
          announcements,
          hasUnfilteredAnnouncements,
          announcementsLoading: false
        })
    );
  }

  locate = () => {
    this.setState({ isLocating: true });
    this.props.api.fetchClosestStations().then(
      ([station]) => {
        this.setState({ isLocating: false });
        this.props.route(this.props.getUrl('station', { station }));
      },
      error => {
        this.setState({ isLocating: false });
        console.error(error);
      }
    );
  };

  renderAnnouncement = ({
    train,
    date,
    scheduledDate,
    estimated,
    cancelled,
    deviations,
    time,
    name,
    track,
    departed,
    removed,
    trainType,
    preliminary,
    trackChanged,
    trainComposition
  }) => (
    <li class={removed ? 'removed' : ''}>
      <a
        class="item-content"
        href={
          train ? (
            this.props.getUrl('train', {
              train,
              date: scheduledDate
            })
          ) : (
            '#'
          )
        }
      >
        <div class="item-inner">
          <div class="hide-when-empty full-width">
            {train && (
              <div class="row">
                <div class="col-20 time">
                  <div
                    class={`original ${estimated || cancelled
                      ? 'has-deviation'
                      : ''}`}
                  >
                    {time}
                  </div>
                  <div
                    class={`actual ${estimated && estimated !== time
                      ? 'late'
                      : ''} ${cancelled ? 'cancelled' : ''}`}
                  >
                    {cancelled ? 'Inställt' : estimated}
                    {preliminary ? '*' : ''}
                  </div>
                </div>
                <div class="col-45 name-col">
                  <div class="name item-title">{name}</div>
                  <div class="sub hide-when-empty">
                    {[departed && 'Har avgått', !cancelled && trainComposition]
                      .concat(deviations)
                      .filter(Boolean)
                      .join('. ')}
                  </div>
                </div>
                <div class="col-10 track">
                  <span
                    class={`${trackChanged ? 'track-changed' : ''} ${cancelled
                      ? 'track-cancelled'
                      : ''}`}
                  >
                    {track}
                  </span>
                </div>
                <div class="col-25 train">
                  <div>{train}</div>
                  <div class="sub">{trainType}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </a>
    </li>
  );

  render(
    { station, favorites, showingDepartures, filter },
    {
      stations,
      announcements,
      announcementsLoading,
      isLocating,
      hasUnfilteredAnnouncements
    }
  ) {
    if (announcementsLoading && !announcements.length) {
      announcements = Array.from(new Array(15));
    }

    const isCurrentStationFavorite = favorites.has(station);
    const shouldShowList = !!announcements.length;
    const shouldShowNoAnnouncementsMessage =
      !announcementsLoading &&
      !announcements.length &&
      !hasUnfilteredAnnouncements;
    const shouldShowDisableFilterMessage =
      !announcementsLoading &&
      !announcements.length &&
      hasUnfilteredAnnouncements;

    let tmp;
    const toggledFavorites = isCurrentStationFavorite
      ? ((tmp = new Set(favorites)), tmp.delete(station), tmp)
      : new Set(favorites).add(station);

    return (
      <div class="view navbar-through toolbar-through station">
        <div class="navbar">
          <div class="navbar-inner hide-when-empty">
            <div class="left">
              <a
                href="#"
                class="link icon-only"
                onClick={event => {
                  event.preventDefault();
                  if (!isLocating) this.locate();
                }}
              >
                {isLocating ? <span class="preloader" /> : <LocateIcon />}
              </a>
            </div>
            <a href={this.props.getUrl('stations')} class="link center sliding">
              {station} ▾
            </a>
            <div class="right">
              <a
                href={this.props.getUrl('station', {
                  favorites: toggledFavorites
                })}
                class="link icon-only"
              >
                <FavoriteIcon active={isCurrentStationFavorite} />
              </a>
            </div>
          </div>
        </div>
        <div class="toolbar">
          <div class="toolbar-inner">
            <div class="buttons-row">
              <a
                href={this.props.getUrl('station', { showingDepartures: true })}
                class={`button ${showingDepartures && 'active'}`}
              >
                Avgångar
              </a>
              <a
                href={this.props.getUrl('station', {
                  showingDepartures: false
                })}
                class={`button ${!showingDepartures && 'active'}`}
              >
                Ankomster
              </a>
            </div>
          </div>
        </div>

        <div class="page">
          <form
            class={`searchbar searchbar-init ${filter
              ? 'searchbar-active'
              : ''} ${filter ? 'searchbar-not-empty' : ''}`}
            onSubmit={event => event.preventDefault()}
          >
            <div class="searchbar-input">
              <input
                placeholder="Sök station som passeras eller tågnummer"
                type="search"
                onInput={event =>
                  this.props.route(
                    this.props.getUrl('station', {
                      filter: event.target.value
                    }),
                    false,
                    !!this.props.filter
                  )}
                value={filter}
              />
              <a
                class="searchbar-clear"
                href="#"
                title="Rensa"
                onClick={event => {
                  this.props.route(
                    this.props.getUrl('station', { filter: '' }),
                    false,
                    !filter
                  );
                  event.preventDefault();
                }}
              />
            </div>
          </form>
          <div class="page-content hide-when-empty">
            {shouldShowList && (
              <div class="list-block">
                <ul>
                  <li class="list-group-title">
                    <div class="row">
                      <div class="col-20 time">Tid</div>
                      <div class="col-45 name item-title">
                        {showingDepartures ? 'Till' : 'Från'}
                      </div>
                      <div class="col-10 track">Spår</div>
                      <div class="col-25 train">Tåg</div>
                    </div>
                  </li>
                  {announcements.reduce(
                    (output, announcement = {}, i, input) => {
                      const tPrev = input[i - 1];
                      if (tPrev && announcement.date !== tPrev.date) {
                        output.push(
                          <li class="list-group-title date-delimiter">
                            {this.props.getNearbyHumanDate(announcement.date) ||
                              announcement.date}
                          </li>
                        );
                      }
                      output.push(this.renderAnnouncement(announcement));
                      return output;
                    },
                    []
                  )}
                </ul>
              </div>
            )}

            {shouldShowNoAnnouncementsMessage && (
              <div class="card">
                <div class="card-header">
                  Inga {showingDepartures ? 'avgångar' : 'ankomster'}
                </div>
                <div class="card-content">
                  <div class="card-content-inner">
                    Det verkar inte finnas några{' '}
                    {showingDepartures ? (
                      'avgångar från'
                    ) : (
                      'ankomster till'
                    )}{' '}
                    <b>{station}</b> den närmsta tiden
                  </div>
                </div>
              </div>
            )}

            {shouldShowDisableFilterMessage && (
              <div class="card disable-filter-card">
                <div class="card-header">
                  ⚠️ Alla existerande{' '}
                  {showingDepartures ? 'avgångar' : 'ankomster'} döljs av
                  filtret
                </div>
                <div class="card-content">
                  <div class="card-content-inner">
                    <a
                      href={this.props.getUrl('station', {
                        filter: ''
                      })}
                      class="button button-big active button-fill color-red"
                    >
                      Rensa filter
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
}
