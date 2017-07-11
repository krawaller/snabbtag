import { h, Component } from 'preact';

export default class Stations extends Component {
  constructor(props) {
    super(props);

    this.api = props.api;
    this.getUrl = props.getUrl;
    this.state = {
      searchFocused: false,
      searchString: '',
      stations: this.api.stations,
      nearbyStations: [],
      trainsBySearchString: {},
      locationPermission: false,
      isLocating: false
    };

    this.getNearbyStations = this.getNearbyStations.bind(this);
  }

  componentDidMount() {
    this.api.fetchLocationPermission().then(locationPermission => {
      this.setState({ locationPermission });
      if (locationPermission) {
        this.getNearbyStations();
      }
    });

    this.api
      .fetchLocationPermission()
      .then(locationPermission => this.setState({ locationPermission }));
  }

  componentDidUpdate(prevProps, prevState) {
    if (
      prevState.searchString &&
      !this.state.searchString &&
      this.state.searchFocused
    ) {
      this.setState({ searchFocused: false });
    }

    if (
      prevState.searchString !== this.state.searchString &&
      /^\d+/.test(this.state.searchString) &&
      !(this.state.searchString in this.state.trainsBySearchString)
    ) {
      const trainsStartingWith = this.state.searchString;
      this.fetchAutocompletedTrains(trainsStartingWith).then(trains =>
        this.setState({
          trainsBySearchString: Object.assign(
            {},
            this.state.trainsBySearchString,
            {
              [trainsStartingWith]: trains
            }
          )
        })
      );
    }
  }

  getNearbyStations() {
    this.setState({ isLocating: true });

    this.api.fetchClosestStations().then(
      closestStations =>
        this.setState({
          nearbyStations: closestStations.slice(0, 3),
          isLocating: false,
          locationPermission: true
        }),
      error => {
        this.setState({ isLocating: false });
        console.error(error);
      }
    );
  }

  fetchAutocompletedTrains(trainsStartingWith) {
    return this.api
      .query(
        `
      <QUERY objecttype="TrainAnnouncement" limit="100">
        <FILTER>
          <EQ name="Advertised" value="true" />
          <EQ name="ActivityType" value="Avgang" />
          <LIKE name="AdvertisedTrainIdent" value="/^${trainsStartingWith}/" />
          <EQ name="ScheduledDepartureDateTime" value="${new Intl.DateTimeFormat(
            'sv-SE'
          ).format(new Date())}" />
        </FILTER>
        <INCLUDE>AdvertisedTrainIdent</INCLUDE>
        <INCLUDE>FromLocation</INCLUDE>
        <INCLUDE>ToLocation</INCLUDE>
        <INCLUDE>AdvertisedTimeAtLocation</INCLUDE>
      </QUERY>`
      )
      .then(({ TrainAnnouncement = [] }) =>
        Object.values(
          TrainAnnouncement.reduce((trains, t) => {
            if (!(t.AdvertisedTrainIdent in trains)) {
              trains[t.AdvertisedTrainIdent] = {
                train: t.AdvertisedTrainIdent,
                from: this.api.getStationBySign(t.FromLocation[0].LocationName),
                to: this.api.getStationBySign(t.ToLocation[0].LocationName),
                at: this.api.extractTime(t.AdvertisedTimeAtLocation)
              };
            }
            return trains;
          }, {})
        )
      );
  }

  render(
    { station, location },
    {
      searchFocused,
      searchString,
      stations,
      nearbyStations,
      trainsBySearchString,
      locationPermission,
      isLocating
    }
  ) {
    console.log('render', this.props, this.state);
    const isTrainNumberSearch = /^\d+$/.test(searchString);
    let listGroups;
    if (isTrainNumberSearch) {
      console.log('t', trainsBySearchString[searchString]);
      listGroups = (
        <div class="list-group">
          <ul>
            <li class="list-group-title">
              <div class="row">
                <div class="col-15">Tåg</div>
                <div class="col-15 time">Avg</div>
                <div class="col-35">Från</div>
                <div class="col-35">Till</div>
              </div>
            </li>
            {(trainsBySearchString[searchString] || Array.from(new Array(20)))
              .map(({ train, at, from, to } = {}) => {
                return (
                  <li>
                    <a
                      href={train ? this.getUrl('train', { train }) : '#'}
                      class="item-link"
                    >
                      <div class="item-content">
                        <div class="item-inner">
                          <div class="hide-when-empty full-width">
                            {train &&
                              <div class="row">
                                <div class="col-15 name">
                                  {train}
                                </div>
                                <div class="col-15 time">
                                  {at}
                                </div>
                                <div class="col-35 name item-title">
                                  {from}
                                </div>
                                <div class="col-35 name item-title">
                                  {to}
                                </div>
                              </div>}
                          </div>
                        </div>
                      </div>
                    </a>
                  </li>
                );
              })}
          </ul>
        </div>
      );
    } else {
      const favorites = new Set(
        (this.props.favorites || '').split(',').filter(Boolean)
      );
      const initialGroups = {};
      if (!(searchFocused || searchString) && favorites.size) {
        initialGroups['Favoriter'] = Array.from(favorites).map(sign =>
          this.api.getStationBySign(sign)
        );
      }

      if (!(searchFocused || searchString) && nearbyStations.length) {
        initialGroups['Närliggande'] = nearbyStations;
      }

      const rSearchString = new RegExp(`^(.*?)(${searchString})(.*)$`, 'i');

      const filteredStations = stations.filter(({ name }) =>
        rSearchString.test(name)
      );

      const groups = filteredStations.reduce((groups, station) => {
        const group = station[0];
        groups[group] = groups[group] || [];
        groups[group].push(station);
        return groups;
      }, initialGroups);

      listGroups = (
        <div>
          {Object.keys(groups).map(group =>
            <div class="list-group">
              <ul>
                <li class="list-group-title">
                  {group}
                </li>
                {groups[group].map(station => {
                  let before, match, after;
                  let content;
                  if (searchString) {
                    let [, before, match, after] = station.match(rSearchString);
                    content = (
                      <div>
                        {before}
                        <b>
                          {match}
                        </b>
                        {after}
                      </div>
                    );
                  } else content = station;
                  return (
                    <li>
                      <a
                        href={
                          station ? this.getUrl('station', { station }) : '#'
                        }
                        class="item-link"
                      >
                        <label class="label-radio item-content">
                          <input
                            type="checkbox"
                            name="station"
                            value={station}
                            checked={
                              station === this.props.station ? 'checked' : null
                            }
                          />
                          <div class="item-inner">
                            {content}
                          </div>
                        </label>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {stations.length > 0 &&
            filteredStations.length === 0 &&
            <ul>
              <li class="item-content">
                <div class="item-inner">
                  <div class="item-title">
                    {`Inga stationer matchar "${searchString}"`}
                  </div>
                </div>
              </li>
            </ul>}
        </div>
      );
    }

    return (
      <div class="view navbar-through">
        <div class="navbar">
          <div class="navbar-inner hide-when-empty">
            <div class="left">
              {this.props.station
                ? <a
                    class="back link"
                    href={this.getUrl('station')}
                    onClick={event => {
                      history.back();
                      event.preventDefault();
                    }}
                  >
                    <i class="icon icon-back" />
                    <span>Tillbaka</span>
                  </a>
                : locationPermission
                  ? null
                  : <a
                      href="#"
                      class="link icon-only"
                      onClick={event => event.preventDefault()}
                      title="Visa närmsta stationer"
                    >
                      {isLocating
                        ? <span class="preloader" />
                        : <svg
                            width="18"
                            viewBox="0 0 41 50"
                            xmlns="http://www.w3.org/2000/svg"
                            onClick={this.getNearbyStations}
                          >
                            <path
                              d="M.724 23.196L41 5 24 45V23.196H.724zM10 21.208L37.2 8.92 25.72 35.933V21.208H10z"
                              fill-rule="evenodd"
                              fill="#007aff"
                            />
                          </svg>}
                    </a>}
            </div>
            <div class="center sliding">Välj…</div>
            <div class="right">
              <a href="/info" class="link icon-only" title="Info">
                <svg
                  width="22"
                  viewBox="0 0 44 44"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <g fill-rule="evenodd" fill="#007aff">
                    <path d="M42 22c0-11.046-8.954-20-20-20S2 10.954 2 22s8.954 20 20 20 20-8.954 20-20zM0 22C0 9.85 9.85 0 22 0s22 9.85 22 22-9.85 22-22 22S0 34.15 0 22z" />
                    <circle cx="22" cy="12" r="3" />
                    <path d="M20 17h4v16h-4V17zm-2 16h8v1h-8v-1zm0-16h2v1h-2v-1z" />
                  </g>
                </svg>
              </a>
            </div>
          </div>
        </div>
        <div class="page">
          <form
            class={`searchbar searchbar-init ${searchFocused || searchString
              ? 'searchbar-active'
              : ''} ${searchString ? 'searchbar-not-empty' : ''}`}
            onSubmit={event => event.preventDefault()}
          >
            <div class="searchbar-input">
              <input
                placeholder="Sök station eller tågnummer"
                type="search"
                onInput={event =>
                  this.setState({ searchString: event.target.value })}
                onFocus={() => this.setState({ searchFocused: true })}
                onBlur={() => this.setState({ searchFocused: false })}
                value={searchString}
              />
              <a
                class="searchbar-clear"
                href="#"
                title="Rensa"
                onClick={() => this.setState({ searchString: '' })}
              />
            </div>
          </form>

          <div
            class={`searchbar-overlay ${searchFocused && !searchString
              ? 'searchbar-overlay-active'
              : ''}`}
            onClick={() => this.setState({ searchFocused: false })}
          />

          <div class="page-content hide-when-empty">
            <div class="list-block">
              {listGroups}
            </div>
          </div>
        </div>
      </div>
    );
  }
}

// [
//   "Cst",
//   "G",
//   "M",
//   "Lu",
//   "Hb",
//   "Hm",
//   "U",
//   "Äs",
//   "Mr",
//   "Söc",
//   "Hie",
//   "Sci",
//   "Nr",
//   "Gä",
//   "Tri",
//   "Lp",
//   "Cr",
//   "N",
//   "Sub",
//   "Bål",
//   "Hpbg",
//   "E",
//   "My",
//   "Hbgb",
//   "A",
//   "Sk",
//   "Kb",
//   "Ks",
//   "Vhe",
//   "Y",
//   "Arnc",
//   "Vö",
//   "Av",
//   "Mot",
//   "Hö",
//   "Söö",
//   "Jö",
//   "Hr",
//   "Än",
//   "Vå"
// ]
