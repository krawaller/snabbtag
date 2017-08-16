import { h, Component } from 'preact';

//FIXME: cancelled
//FIXME: resilience
//FIXME: late station
//FIXME: sticky chrome headers

export default class Station extends Component {
  constructor(props) {
    super(props);

    this.api = props.api;

    this.state = {
      stations: props.api.stations,
      trainAnnouncements: [],
      trainAnnouncementsLoading: true,
      hasUnfilteredAnnouncements: false,
      isLocating: false
    };

    if (
      this.props.station.toLowerCase() ===
      this.api.getSignByStation(this.props.station)
    )
      route(
        this.props.getUrl('station', {
          station: this.api.getStationBySign(this.props.station)
        }),
        true
      );
  }

  componentDidMount() {
    this.updateStationSubscription();
  }

  componentDidUpdate(prevProps, prevState) {
    if (
      prevProps.station !== this.props.station ||
      prevProps.showingDepartures !== this.props.showingDepartures ||
      prevProps.favoriteTrafficOnly !== this.props.favoriteTrafficOnly
    ) {
      this.updateStationSubscription();
    }
  }

  updateStationSubscription() {
    this.setState({
      trainAnnouncements: [],
      trainAnnouncementsLoading: true
    });
    const { showingDepartures, favoriteTrafficOnly, favorites } = this.props;

    if (this.subscription) this.subscription.cancel();
    this.subscription = this.subscribeStation(
      this.props.station,
      showingDepartures,
      favoriteTrafficOnly,
      favorites,
      ({ announcements, hasUnfilteredAnnouncements }) => {
        this.setState({
          trainAnnouncements: announcements,
          hasUnfilteredAnnouncements,
          trainAnnouncementsLoading: false
        });
      }
    );
  }

  locate = () => {
    this.setState({ isLocating: true });
    this.api.fetchClosestStations().then(
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

  fetchStation(
    station,
    departures,
    filterFavorites,
    favorites,
    lastModified,
    lastAdvertisedTimeAtLocation
  ) {
    return this.api
      .query(
        `
      <QUERY objecttype="TrainAnnouncement" orderby="AdvertisedTimeAtLocation" lastmodified="TRUE">
        <FILTER>
          <AND>
            <EQ name="ActivityType" value="${departures
              ? 'Avgang'
              : 'Ankomst'}" />
            <EQ name="Advertised" value="TRUE" />
            <EQ name="LocationSignature" value="${this.api.getSignByStation(
              station
            )}" />
            <OR>
              <AND>
                <GT name="AdvertisedTimeAtLocation" value="$dateadd(-00:15:00)" />
                <LT name="AdvertisedTimeAtLocation" value="$dateadd(14:00:00)" />
              </AND>
              <AND>
                <GT name="EstimatedTimeAtLocation" value="$dateadd(-00:15:00)" />
                <LT name="AdvertisedTimeAtLocation" value="$dateadd(00:30:00)" />
              </AND>
            </OR>
            ${lastModified
              ? `
              <OR>
                <GT name="ModifiedTime" value="${lastModified}"/>
                ${lastAdvertisedTimeAtLocation
                  ? `<GT name="AdvertisedTimeAtLocation" value="${lastAdvertisedTimeAtLocation}"/>`
                  : ''}
              </OR>`
              : ''}
          </AND>
        </FILTER>
        <INCLUDE>AdvertisedTrainIdent</INCLUDE>
        <INCLUDE>AdvertisedTimeAtLocation</INCLUDE>
        <INCLUDE>EstimatedTimeAtLocation</INCLUDE>
        <INCLUDE>TrackAtLocation</INCLUDE>
        <INCLUDE>ScheduledDepartureDateTime</INCLUDE>
        <INCLUDE>Canceled</INCLUDE>
        <INCLUDE>Deviation</INCLUDE>
        <INCLUDE>ActivityId</INCLUDE>
        <INCLUDE>${departures ? 'ToLocation' : 'FromLocation'}</INCLUDE>
      </QUERY>`
      )
      .then(
        ({
          TrainAnnouncement: announcements = [],
          INFO: {
            LASTMODIFIED: { '@datetime': lastModified = false } = {}
          } = {}
        }) => {
          if (!filterFavorites || lastModified === false)
            return { announcements, lastModified };

          const filteredFavorites = new Set(favorites);
          filteredFavorites.delete(station);
          return this.api
            .query(
              `
          <QUERY objecttype="TrainAnnouncement" orderby="AdvertisedTimeAtLocation">
            <FILTER>
              <AND>
                <EQ name="ActivityType" value="${!departures
                  ? 'Avgang'
                  : 'Ankomst'}" />
                <EQ name="Advertised" value="TRUE" />
                <IN
                  name="LocationSignature"
                  value="${Array.from(filteredFavorites.values())
                    .map(favorite => this.api.getSignByStation(favorite))
                    .filter(Boolean)
                    .join(',')}" />
                <IN
                  name="AdvertisedTrainIdent"
                  value="${announcements
                    .map(({ AdvertisedTrainIdent }) => AdvertisedTrainIdent)
                    .join(',')}" />
              </AND>
            </FILTER>
            <INCLUDE>AdvertisedTrainIdent</INCLUDE>
            <INCLUDE>ScheduledDepartureDateTime</INCLUDE>
            <INCLUDE>AdvertisedTimeAtLocation</INCLUDE>
          </QUERY>`
            )
            .then(({ TrainAnnouncement: filterAnnouncements = [] }) => {
              const filterMap = filterAnnouncements.reduce(
                (
                  filterMap,
                  {
                    ScheduledDepartureDateTime,
                    AdvertisedTrainIdent,
                    AdvertisedTimeAtLocation
                  }
                ) => {
                  if (filterMap[ScheduledDepartureDateTime] === undefined) {
                    filterMap[ScheduledDepartureDateTime] = {};
                  }
                  filterMap[ScheduledDepartureDateTime][
                    AdvertisedTrainIdent
                  ] = AdvertisedTimeAtLocation;
                  return filterMap;
                },
                {}
              );

              return {
                announcements: announcements.filter(
                  ({
                    ScheduledDepartureDateTime,
                    AdvertisedTrainIdent,
                    AdvertisedTimeAtLocation
                  }) => {
                    const filteredAdvertisedTimeAtLocation =
                      filterMap[ScheduledDepartureDateTime] &&
                      filterMap[ScheduledDepartureDateTime][
                        AdvertisedTrainIdent
                      ];
                    return departures
                      ? filteredAdvertisedTimeAtLocation >
                        AdvertisedTimeAtLocation
                      : filteredAdvertisedTimeAtLocation <
                        AdvertisedTimeAtLocation;
                  }
                ),
                hasUnfilteredAnnouncements: !!announcements.length,
                lastModified
              };
            });
        }
      );
  }

  subscribeStation(station, departures, filterFavorites, favorites, callback) {
    let checkTimeout;
    let cancelled = false;
    let formattedAnnouncementsById = {};
    let currentLastModified;
    let currentLastAdvertisedTimeAtLocation;
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
      const dt = new Date();
      dt.setMinutes(dt.getMinutes() - 15);
      const maxDate = new Intl.DateTimeFormat('sv-SE', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric'
      })
        .format(dt)
        .replace(' ', 'T');

      this.fetchStation(
        station,
        departures,
        filterFavorites,
        favorites,
        currentLastModified,
        currentLastAdvertisedTimeAtLocation
      ).then(
        ({ announcements, hasUnfilteredAnnouncements, lastModified }) => {
          if (cancelled) return;
          isChecking = false;
          retryCount = 0;

          if (!document.hidden && window.navigator.onLine)
            setTimeout(check, this.api.CHECK_INTERVAL);

          let purged = false;
          for (let id in formattedAnnouncementsById) {
            const {
              AdvertisedTimeAtLocation,
              EstimatedTimeAtLocation
            } = formattedAnnouncementsById[id];
            if (
              AdvertisedTimeAtLocation < maxDate &&
              (!EstimatedTimeAtLocation || EstimatedTimeAtLocation < maxDate)
            ) {
              purged = true;
              delete formattedAnnouncementsById[id];
            }
          }

          if (!purged && lastModified === false) return;

          formattedAnnouncementsById = announcements.reduce(
            (all, announcement, i, arr) => {
              const [_, date, time] =
                announcement.AdvertisedTimeAtLocation.match(
                  /^(\d{4}\-\d{2}-\d{2})T(\d{2}:\d{2})/
                ) || [];

              all[announcement.ActivityId] = {
                name: this.api.getStationBySign(
                  (announcement.ToLocation || announcement.FromLocation)[0]
                    .LocationName
                ),
                via: (announcement.ViaToLocation ||
                  announcement.ViaFromLocation ||
                  [])
                  .map(l => this.api.getStationBySign(l.LocationName))
                  .filter(Boolean),
                signs: (announcement.ToLocation || announcement.FromLocation)
                  .map(l => l.LocationName),
                date: this.api.extractDate(
                  announcement.AdvertisedTimeAtLocation
                ),
                time: this.api.extractTime(
                  announcement.AdvertisedTimeAtLocation
                ),
                datetime: announcement.AdvertisedTimeAtLocation,
                estimated: this.api.extractTime(
                  announcement.EstimatedTimeAtLocation
                ),
                train: announcement.AdvertisedTrainIdent,
                track: announcement.TrackAtLocation,
                scheduledDate: this.api.extractDate(
                  announcement.ScheduledDepartureDateTime
                ),
                cancelled: !!announcement.Canceled,
                deviations: announcement.Deviation,
                AdvertisedTimeAtLocation: announcement.AdvertisedTimeAtLocation,
                EstimatedTimeAtLocation: announcement.EstimatedTimeAtLocation
              };
              return all;
            },
            formattedAnnouncementsById
          );

          if (lastModified) currentLastModified = lastModified;

          announcements = Object.values(formattedAnnouncementsById);
          currentLastAdvertisedTimeAtLocation = (announcements[
            announcements.length - 1
          ] || {}).AdvertisedTimeAtLocation;

          callback({
            announcements,
            hasUnfilteredAnnouncements
          });
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
    { station, favorites, showingDepartures, favoriteTrafficOnly },
    {
      stations,

      trainAnnouncements,
      trainAnnouncementsLoading,

      isLocating,
      hasUnfilteredAnnouncements
    }
  ) {
    if (trainAnnouncementsLoading && !trainAnnouncements.length) {
      trainAnnouncements = Array.from(new Array(15));
    }

    const isCurrentStationFavorite = favorites.has(station);
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
                  : <svg
                      width="18"
                      viewBox="0 0 41 50"
                      xmlns="http://www.w3.org/2000/svg"
                      onClick={this.locate}
                    >
                      <path
                        d="M.724 23.196L41 5 24 45V23.196H.724zM10 21.208L37.2 8.92 25.72 35.933V21.208H10z"
                        fill-rule="evenodd"
                        fill="#007aff"
                      />
                    </svg>}
              </a>
            </div>
            <a href={this.props.getUrl('stations')} class="link center sliding">
              {station} ▾
            </a>
            <div class="right">
              <a
                href={this.props.getUrl('station', {
                  favorites: favorites.has(station)
                    ? ((tmp = new Set(favorites)), tmp.delete(station), tmp)
                    : new Set(favorites).add(station)
                })}
                class="link icon-only"
              >
                <svg
                  width="22"
                  viewBox="0 0 51 45"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  {isCurrentStationFavorite
                    ? <path
                        d="M25.156 44.736c.102.075.156-.117.156-.117 1.476-1.1 7.757-5.796 9.768-7.637 10.205-9.34 21.444-23.698 11.163-33.17C36.68-5 26.527 4.04 25.156 5.343c-1.37-1.3-11.523-10.34-21.086-1.527-10.28 9.472.957 23.83 11.162 33.17 2.01 1.84 8.293 6.536 9.768 7.634 0 0 .055.19.156.116z"
                        fill-rule="evenodd"
                        fill="#007aff"
                      />
                    : <path
                        d="M25.63 6.063s-10-9-18-3-7 15 0 24 18 16 18 16 11-7 18-16 8-18 0-24-18 3-18 3z"
                        stroke="#007aff"
                        stroke-width="2"
                        fill="none"
                      />}
                </svg>
              </a>
            </div>
          </div>
        </div>
        <div class="toolbar">
          <div class="toolbar-inner">
            <a
              href={this.props.getUrl('station', {
                favoriteTrafficOnly: !favoriteTrafficOnly
              })}
              class="link icon-only"
            >
              <svg
                width="22"
                viewBox="0 0 42 50"
                xmlns="http://www.w3.org/2000/svg"
                fill="#007aff"
              >
                {favoriteTrafficOnly
                  ? <g fill-rule="evenodd">
                      <g transform="translate(0 9)">
                        <path d="M38 3h4v2h-4zM0 3h26v2H0z" />
                        <circle cx="32" cy="4" r="4" />
                      </g>
                      <g transform="translate(0 33)">
                        <path d="M38 3h4v2h-4zM0 3h26v2H0z" />
                        <circle cx="32" cy="4" r="4" />
                      </g>
                      <g transform="translate(0 21)">
                        <path d="M18 3h24v2H18zM0 3h6v2H0z" />
                        <circle cx="12" cy="4" r="4" />
                      </g>
                    </g>
                  : <path
                      d="M38 12h4v2h-4zM0 12h26v2H0zm34 1c0-1.105-.895-2-2-2s-2 .895-2 2 .895 2 2 2 2-.895 2-2zm-6 0c0-2.21 1.79-4 4-4s4 1.79 4 4-1.79 4-4 4-4-1.79-4-4zm10 23h4v2h-4zM0 36h26v2H0zm34 1c0-1.105-.895-2-2-2s-2 .895-2 2 .895 2 2 2 2-.895 2-2zm-6 0c0-2.21 1.79-4 4-4s4 1.79 4 4-1.79 4-4 4-4-1.79-4-4zM18 24h24v2H18zM0 24h6v2H0zm14 1c0-1.105-.895-2-2-2s-2 .895-2 2 .895 2 2 2 2-.895 2-2zm-6 0c0-2.21 1.79-4 4-4s4 1.79 4 4-1.79 4-4 4-4-1.79-4-4z"
                      fill-rule="evenodd"
                    />}
              </svg>
            </a>
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
                      <div class="col-20 time">Tid</div>
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
                      const tPrev = input[i - 1];
                      if (tPrev && date !== tPrev.date) {
                        output.push(
                          <li class="list-group-title date-delimiter">
                            {this.props.getNearbyHumanDate(date) || date}
                          </li>
                        );
                      }
                      output.push(
                        <li>
                          <a
                            class="item-link item-content"
                            href={
                              train
                                ? this.props.getUrl('train', {
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
                                        class={`original ${estimated ||
                                        cancelled
                                          ? 'has-deviation'
                                          : ''}`}
                                      >
                                        {time}
                                      </div>
                                      <div
                                        class={`actual ${estimated &&
                                        estimated !== time
                                          ? 'late'
                                          : ''} ${cancelled
                                          ? 'cancelled'
                                          : ''}`}
                                      >
                                        {cancelled ? 'Inställt' : estimated}
                                      </div>
                                    </div>
                                    <div class="col-50 name item-title">
                                      {name}{' '}
                                      {deviations &&
                                        deviations.map(deviation =>
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
                                    </div>
                                    <div class="col-10 track">
                                      {track}
                                    </div>
                                    <div class="col-20 train">
                                      {train}
                                    </div>
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
                    Det verkar inte finnas några{' '}
                    {showingDepartures
                      ? 'avgångar från'
                      : 'ankomster till'}{' '}
                    <b>{station}</b> den närmsta tiden
                  </div>
                </div>
              </div>}

            {shouldShowDisableFilterMessage &&
              <div class="card disable-filter-card">
                <div class="card-header">
                  ⚠️ Alla existerande{' '}
                  {showingDepartures ? 'avgångar' : 'ankomster'} döljs av
                  favoritfiltret
                </div>
                <div class="card-content">
                  <div class="card-content-inner">
                    <a
                      href={this.props.getUrl('station', {
                        favoriteTrafficOnly: false
                      })}
                      class="button button-big active button-fill color-red"
                    >
                      Slå av favoritfilter
                    </a>
                  </div>
                </div>
                <div class="card-footer">
                  Eller lägg även till din tilltänka{' '}
                  {showingDepartures ? 'ankomsts' : 'avgångs'}
                  station som favorit för att få favoritfiltret att fungera som
                  tänkt.
                </div>
              </div>}
          </div>
        </div>
      </div>
    );
  }
}
