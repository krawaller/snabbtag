import { h, Component } from 'preact';
import { LocateIcon, FavoriteIcon } from './Icons';

//FIXME: sticky chrome headers
//FIXME: latest status?
//FIXME: stable list animations
//FIXME: check api burst after sleep

export default class Station extends Component {
  constructor(props) {
    super(props);

    this.api = props.api;

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
    return (this.subscription = this.subscribeStation(
      this.props,
      ({ announcements, hasUnfilteredAnnouncements }) =>
        this.setState({
          announcements,
          hasUnfilteredAnnouncements,
          announcementsLoading: false
        })
    ));
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
    showingDepartures,
    favorites,
    filter,
    lastModified,
    lastAdvertisedTimeAtLocation
  ) {
    return this.api
      .query(
        `
      <QUERY objecttype="TrainAnnouncement" orderby="AdvertisedTimeAtLocation" lastmodified="TRUE">
        <FILTER>
          <AND>
            <EQ name="ActivityType" value="${showingDepartures
              ? 'Avgang'
              : 'Ankomst'}" />
            <EQ name="Advertised" value="TRUE" />
            <EQ name="LocationSignature" value="${this.api.getSignByStation(
              station
            )}" />
            <OR>
              <AND>
                <GT name="AdvertisedTimeAtLocation" value="$dateadd(-00:10:00)" />
                <LT name="AdvertisedTimeAtLocation" value="$dateadd(14:00:00)" />
              </AND>
              <AND>
                <GT name="EstimatedTimeAtLocation" value="$dateadd(-00:10:00)" />
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
        <INCLUDE>TimeAtLocation</INCLUDE>
        <INCLUDE>TrackAtLocation</INCLUDE>
        <INCLUDE>ScheduledDepartureDateTime</INCLUDE>
        <INCLUDE>Canceled</INCLUDE>
        <INCLUDE>Deviation</INCLUDE>
        <INCLUDE>ActivityId</INCLUDE>
        <INCLUDE>ProductInformation</INCLUDE>
        <INCLUDE>TrainComposition</INCLUDE>
        <INCLUDE>${showingDepartures ? 'ToLocation' : 'FromLocation'}</INCLUDE>
      </QUERY>`
      )
      .then(
        ({
          TrainAnnouncement: announcements = [],
          INFO: {
            LASTMODIFIED: { '@datetime': lastModified = false } = {}
          } = {}
        }) => {
          const response = {
            announcements,
            lastModified,
            lastAdvertisedTimeAtLocation: (announcements[
              announcements.length - 1
            ] || {}).AdvertisedTimeAtLocation,
            hasUnfilteredAnnouncements: !!announcements.length
          };
          const rFilter = new RegExp(filter, 'i');

          if (/^\d+$/.test(filter)) {
            return {
              ...response,
              announcements: announcements.filter(({ AdvertisedTrainIdent }) =>
                rFilter.test(AdvertisedTrainIdent)
              )
            };
          }

          if (filter.length < 2 || lastModified === false) return response;

          return this.api
            .query(
              `
          <QUERY objecttype="TrainAnnouncement" orderby="AdvertisedTimeAtLocation">
            <FILTER>
              <AND>
                <EQ name="ActivityType" value="${!showingDepartures
                  ? 'Avgang'
                  : 'Ankomst'}" />
                <EQ name="Advertised" value="TRUE" />
                <IN
                  name="AdvertisedTrainIdent"
                  value="${announcements
                    .map(({ AdvertisedTrainIdent }) => AdvertisedTrainIdent)
                    .join(',')}" />
                <IN
                name="LocationSignature"
                value="${Object.keys(this.api.signsByStation)
                  .filter(station => rFilter.test(station))
                  .map(this.api.getSignByStation.bind(this.api))
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
                ...response,
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
                    return showingDepartures
                      ? filteredAdvertisedTimeAtLocation >
                        AdvertisedTimeAtLocation
                      : filteredAdvertisedTimeAtLocation <
                        AdvertisedTimeAtLocation;
                  }
                )
              };
            });
        }
      );
  }

  subscribeStation(
    { station, showingDepartures, favorites, filter = '' },
    callback
  ) {
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
      removeEventListener('visibilitychange', handleVisibilityChange);
      removeEventListener('online', check);
    };

    const check = () => {
      if (isChecking) return;
      isChecking = true;
      const dt = new Date();
      dt.setMinutes(dt.getMinutes() - 10);
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
        showingDepartures,
        favorites,
        filter,
        currentLastModified,
        currentLastAdvertisedTimeAtLocation
      ).then(
        ({
          announcements,
          hasUnfilteredAnnouncements,
          lastModified,
          lastAdvertisedTimeAtLocation
        }) => {
          if (cancelled) return;
          isChecking = false;
          retryCount = 0;

          if (!document.hidden && navigator.onLine)
            checkTimeout = setTimeout(check, this.api.CHECK_INTERVAL);

          let purged = false;
          for (let id in formattedAnnouncementsById) {
            const {
              AdvertisedTimeAtLocation,
              EstimatedTimeAtLocation,
              removed
            } = formattedAnnouncementsById[id];

            if (removed) {
              purged = true;
              delete formattedAnnouncementsById[id];
              continue;
            }
            if (
              AdvertisedTimeAtLocation < maxDate &&
              (!EstimatedTimeAtLocation || EstimatedTimeAtLocation < maxDate)
            ) {
              purged = formattedAnnouncementsById[id].removed = true;
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
                deviations: (announcement.Deviation || [])
                  .filter(
                    deviation =>
                      !/^inställ|^prel\. tid|^spårändrat/i.test(deviation)
                  ),
                preliminary: !!(announcement.Deviation || [])
                  .find(deviation => /^prel\. tid/i.test(deviation)),
                trackChanged: !!(announcement.Deviation || [])
                  .find(deviation => /^spårändrat/i.test(deviation)),
                departed: !!announcement.TimeAtLocation,
                removed: !!(all[announcement.ActivityId] || {}).removed,
                trainType: (announcement.ProductInformation || [''])[0],
                trainComposition: ((announcement.TrainComposition || [])
                  .filter(
                    trainComposition => !/vagnsordning/i.test(trainComposition)
                  )[0] || '')
                  .replace(/.\s*$/, ''),
                AdvertisedTimeAtLocation: announcement.AdvertisedTimeAtLocation,
                EstimatedTimeAtLocation: announcement.EstimatedTimeAtLocation
              };
              return all;
            },
            formattedAnnouncementsById
          );

          if (
            (lastModified && !currentLastModified) ||
            lastModified > currentLastModified
          )
            currentLastModified = lastModified;

          announcements = Object.values(formattedAnnouncementsById);
          currentLastAdvertisedTimeAtLocation = lastAdvertisedTimeAtLocation;
          callback({
            announcements,
            hasUnfilteredAnnouncements
          });
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
  }) =>
    <li class={removed ? 'removed' : ''}>
      <a
        class="item-content"
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
                  <div class="name item-title">
                    {name}
                  </div>
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
                  <div>
                    {train}
                  </div>
                  <div class="sub">
                    {trainType}
                  </div>
                </div>
              </div>}
          </div>
        </div>
      </a>
    </li>;

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
            {shouldShowList &&
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
              </div>}
          </div>
        </div>
      </div>
    );
  }
}
