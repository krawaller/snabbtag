import { h, Component } from 'preact';
import TrainNumberSearchResult from 'async!../components/TrainNumberSearchResult';
//TODO: where's ystad
export default class Stations extends Component {
  constructor(props) {
    super(props);

    this.api = props.api;
    this.getUrl = props.getUrl;
    this.state = {
      searchFocused: false,
      searchString: '',
      stations: this.api.stations,
      popular: [
        'Stockholm',
        'Göteborg',
        'Malmö',
        'Lund',
        'Helsingborg',
        'Hässleholm',
        'Uppsala',
        'Märsta',
        'Hyllie',
        'Norrköping',
        'Gävle',
        'Triangeln',
        'Linköping',
        'Kristianstad',
        'Nässjö',
        'Sundbyberg',
        'Bålsta',
        'Hallsberg',
        'Eslöv',
        'Mjölby'
      ],
      nearbyStations: [],
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
  }

  getNearbyStations = () => {
    this.setState({ isLocating: true });

    this.api.fetchClosestStations().then(
      closestStations =>
        this.setState({
          nearbyStations: closestStations,
          isLocating: false,
          locationPermission: true
        }),
      error => {
        this.setState({ isLocating: false });
        console.error(error);
      }
    );
  }

  render(
    props,
    {
      searchFocused,
      searchString,
      stations,
      popular,
      nearbyStations,
      locationPermission,
      isLocating
    }
  ) {
    const isTrainNumberSearch = /^\d+$/.test(searchString);
    let listGroups;
    if (isTrainNumberSearch) {
      listGroups = (
        <TrainNumberSearchResult
          api={this.api}
          searchString={searchString}
          getUrl={this.getUrl}
        />
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
      const filteredStations = rSearchString
        ? stations.filter(rSearchString.test.bind(rSearchString))
        : stations;

      let groups = initialGroups;
      if (searchString) {
        groups = filteredStations.reduce((groups, station) => {
          const group = station[0];
          groups[group] = groups[group] || [];
          groups[group].push(station);
          return groups;
        }, initialGroups);
      } else {
        initialGroups['Populära'] = popular;
      }

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
          <noscript>
            <div class="page-content">
              <div class="card">
                <div class="card-content">
                  <div class="card-content-inner">
                    Denna app fungerar dessvärre inte utan javascript :-(
                  </div>
                </div>
              </div>
            </div>
          </noscript>
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
