import { h, Component } from 'preact';
import { route } from 'preact-router';
import { getUrl, getNearbyHumanDate } from '../lib/utils';

//FIXME cancelled
//FIXME resilience
//FIXME late station
//FIXME sticky chrome headers
//FIXME station fetching fresh stations even though lastmodified
//FIXME idag/igår runt midnatt

export default class Station extends Component {
  constructor(props) {
    super(props);
    console.log('constructor', { props });
    this.api = props.api;

    // FIXME update instead?
    this.state = {
      stations: props.api.stations,
      station: this.api.getStationBySign(this.props.station),
      favorites: new Set((props.favorites || '').split(',').filter(Boolean)),
      showingDepartures: props.type !== 'arrivals',
      favoriteTrafficOnly: props.favorite_traffic_only === 'true',
      trainAnnouncements: [],
      trainAnnouncementsLoading: true,
      hasUnfilteredAnnouncements: false,
      isLocating: false
    };

    this.locate = this.locate.bind(this);
  }

  componentDidMount() {
    // this.api.fetchLocationPermission().then(locationPermission => {
    //   if (locationPermission) this.locate();
    // })

    this.api.fetchStations().then(stations => {
      const station = this.api.getStationBySign(
        this.props.station || Array.from(this.state.favorites.values()).pop()
      );

      if (station) this.setState({ stations, station });
      else {
        this.api.fetchLocationPermission().then(locationPermission => {
          return (locationPermission
            ? this.api.fetchClosestStations()
            : this.api.fetchClosestStationsUsingGeoIP()).then(([station]) =>
            route(getUrl.call(this, 'station', { station }))
          );
        });
      }
    });
    if (this.state.station) this.updateStationSubscription();

    // const interval = setInterval(() => {
    //   const trainAnnouncements = this.state.trainAnnouncements.concat();
    //   const a = trainAnnouncements.find(a => (a && !a.estimated))

    //   if (a) {
    //     a.estimated = a.time.replace(/\d$/, '7')

    //     this.setState({
    //       trainAnnouncements
    //     })

    //   } else clearInterval(interval)
    // }, 1000)
  }

  componentDidUpdate(prevProps, prevState) {
    console.log('componentDidUpdate', {
      prevState,
      state: this.state,
      prevProps,
      props: this.props
    });

    if (prevProps.station !== this.props.station) {
      console.log('notsame');
      const station = this.api.getStationBySign(this.props.station);
      if (station) this.setState({ station });
      // else route(this.getUpdatedUrl({ sign: prevProps.station })); //FIXME
    }

    if (prevProps.favorites !== this.props.favorites) {
      this.setState({
        favorites: new Set(
          (this.props.favorites || '').split(',').filter(Boolean)
        )
      });
    }

    if (
      prevProps.matches.favorite_traffic_only !==
      this.props.matches.favorite_traffic_only
    ) {
      this.setState({
        favoriteTrafficOnly: this.props.matches.favorite_traffic_only
      });
    }

    if (prevProps.type !== this.props.type) {
      this.setState({
        showingDepartures: this.props.type === 'departures'
      });
    }

    if (
      this.state.station &&
      (prevState.station !== this.state.station ||
        prevState.showingDepartures !== this.state.showingDepartures ||
        prevState.favoriteTrafficOnly !== this.state.favoriteTrafficOnly)
    ) {
      this.updateStationSubscription();
    }
  }

  updateStationSubscription() {
    this.setState({
      trainAnnouncements: [],
      trainAnnouncementsLoading: true
    });
    const {
      station: { sign },
      showingDepartures,
      favoriteTrafficOnly,
      favorites
    } = this.state;

    if (this.subscription) this.subscription.cancel();
    this.subscription = this.props.api.subscribeStation(
      sign,
      showingDepartures,
      favoriteTrafficOnly,
      favorites,
      ({ announcements, hasUnfilteredAnnouncements }) => {
        console.log({ announcements, hasUnfilteredAnnouncements });
        this.setState({
          trainAnnouncements: announcements,
          hasUnfilteredAnnouncements,
          trainAnnouncementsLoading: false
        });
      }
    );
  }

  locate() {
    this.setState({ isLocating: true });
    this.api.fetchClosestStations().then(
      ([station]) => {
        this.setState({ isLocating: false });
        route(getUrl.call(this, 'station', { station }));
      },
      error => {
        this.setState({ isLocating: false });
        console.error(error);
      }
    );
  }

  render(
    props,
    {
      stations,
      station,
      favorites,
      showingDepartures,
      trainAnnouncements,
      trainAnnouncementsLoading,
      favoriteTrafficOnly,
      isLocating,
      hasUnfilteredAnnouncements
    }
  ) {
    if (trainAnnouncementsLoading && !trainAnnouncements.length) {
      trainAnnouncements = Array.from(new Array(15));
    }

    const isCurrentStationFavorite = !!station && favorites.has(station.name);
    const shouldShowList = !!trainAnnouncements.length;
    const shouldShowNoAnnouncementsMessage =
      !trainAnnouncementsLoading &&
      !trainAnnouncements.length &&
      !hasUnfilteredAnnouncements;
    const shouldShowDisableFilterMessage =
      !trainAnnouncementsLoading &&
      !trainAnnouncements.length &&
      hasUnfilteredAnnouncements;

    let tmp;
    console.log({station})
    if (!station) return null;

    return (
      <div class="view navbar-through toolbar-through">
        <div class="navbar">
          <div class="navbar-inner hide-when-empty">
            <div class="left">
              <a
                href="#"
                class="link icon-only"
                onClick={event => event.preventDefault()}
              >
                {isLocating
                  ? <span class="preloader" />
                  : <i class="f7-icons" onClick={this.locate}>
                      navigation
                    </i>}
              </a>
            </div>
            <a href={getUrl.call(this, 'stations')} class="link center sliding">
              {station && station.name} ▾
            </a>
            <div class="right">
              <a
                href={getUrl.call(this, 'station', {
                  favorites: favorites.has(station.name)
                    ? ((tmp = new Set(favorites)), tmp.delete(
                        station.name
                      ), tmp)
                    : new Set(favorites).add(station.name)
                })}
                class="link icon-only"
              >
                <i class="f7-icons">
                  {isCurrentStationFavorite ? 'heart_fill' : 'heart'}
                </i>
              </a>
            </div>
          </div>
        </div>
        <div class="toolbar">
          <div class="toolbar-inner">
            <a
              href={getUrl.call(this, 'station', {
                favoriteTrafficOnly: !favoriteTrafficOnly
              })}
              class="link icon-only"
            >
              <i class="f7-icons">
                {favoriteTrafficOnly ? 'filter-fill' : 'filter'}
              </i>
            </a>
            <div class="buttons-row">
              <a
                href={getUrl.call(this, 'station', { showingDepartures: true })}
                class={`button ${showingDepartures && 'active'}`}
              >
                Avgångar
              </a>
              <a
                href={getUrl.call(this, 'station', {
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
          <div class="page-content hide-when-empty">
            {shouldShowList &&
              <div class="list-block">
                {favoriteTrafficOnly &&
                  <div class="content-block-title">
                    ⚠️ Visar endast favorittrafik
                  </div>}
                <ul>
                  <li class="list-group-title">
                    <div class="row">
                      <div class="col-20 time">
                        Tid
                      </div>
                      <div class="col-50 name item-title">
                        {showingDepartures ? 'Till' : 'Från'}
                      </div>
                      <div class="col-10 track">Spår</div>
                      <div class="col-20 train">Tåg</div>
                    </div>
                  </li>
                  {trainAnnouncements.reduce(
                    (
                      output,
                      {
                        train,
                        date,
                        scheduledDate,
                        estimated,
                        cancelled,
                        deviations,
                        time,
                        name,
                        track
                      } = {},
                      i,
                      input
                    ) => {
                      // console.log({ train, cancelled, deviations });
                      const tPrev = input[i - 1];
                      if (tPrev && date !== tPrev.date) {
                        output.push(
                          <li class="list-group-title date-delimiter">
                            {getNearbyHumanDate(date) || date}
                          </li>
                        );
                      }
                      output.push(
                        <li>
                          <a
                            class="item-link item-content"
                            href={
                              train
                                ? getUrl.call(this, 'train', {
                                    train,
                                    date: scheduledDate
                                  })
                                : '#'
                            }
                          >
                            <div class="item-inner">
                              <div class="hide-when-empty full-width">
                                {train &&
                                  <div class="row">
                                    <div class="col-20 time">
                                      <div
                                        class={`original ${estimated || cancelled ? 'has-deviation' : ''}`}
                                      >
                                        {time}
                                      </div>
                                      <div
                                        class={`actual ${estimated && estimated !== time ? 'late' : ''} ${cancelled ? 'cancelled' : ''}`}
                                      >
                                        {cancelled ? 'Inställt' : estimated}
                                      </div>
                                    </div>
                                    <div class="col-50 name item-title">
                                      {name} {deviations &&
                                        deviations.map(deviation => (
                                          <span>
                                            <div
                                              class={`chip ${/inställ|ersätter/i.test(deviation) ? 'color-red' : ''}`}
                                            >
                                              <div class="chip-label">
                                                {deviation}
                                              </div>
                                            </div>{' '}
                                          </span>
                                        ))}
                                    </div>
                                    <div class="col-10 track">{track}</div>
                                    <div class="col-20 train">{train}</div>
                                  </div>}
                              </div>
                            </div>
                          </a>
                        </li>
                      );
                      return output;
                    },
                    []
                  )}
                </ul>
              </div>}

            {shouldShowNoAnnouncementsMessage &&
              <div class="card">
                <div class="card-header">
                  Inga {showingDepartures ? 'avgångar' : 'ankomster'}
                </div>
                <div class="card-content">
                  <div class="card-content-inner">
                    Det verkar inte finnas några
                    {' '}
                    {showingDepartures ? 'avgångar från' : 'ankomster till'}
                    {' '}
                    <b>{station.name}</b>
                    {' '}
                    den närmsta tiden
                  </div>
                </div>
              </div>}

            {shouldShowDisableFilterMessage &&
              <div class="card disable-filter-card">
                <div class="card-header">
                  Alla existerande
                  {' '}
                  {showingDepartures ? 'avgångar' : 'ankomster'}
                  {' '}
                  döljs av favoritfiltret
                </div>
                <div class="card-content">
                  <div class="card-content-inner">
                    <a
                      href={getUrl.call(this, 'station', {
                        favoriteTrafficOnly: false
                      })}
                      class="button button-big active button-fill color-red"
                    >
                      Slå av favoritfilter
                    </a>
                  </div>
                </div>
                <div class="card-footer">
                  Eller lägg även till din tilltänka
                  {' '}
                  {showingDepartures ? 'ankomsts' : 'avgångs'}
                  station som favorit för att få favoritfiltret att fungera som tänkt.
                </div>
              </div>}
          </div>
        </div>
      </div>
    );
  }
}
