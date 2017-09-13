import { h, Component } from 'preact';
import TrainNumberSearchResult from './TrainNumberSearchResult';
import { InfoIcon, LocateIcon } from './Icons';

export default class Stations extends Component {
  constructor(props) {
    super(props);

    this.api = props.api;
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

    document.title = 'Stationer';
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
  };

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
          getUrl={this.props.getUrl}
        />
      );
    } else {
      const initialGroups = {};
      if (!(searchFocused || searchString) && this.props.favorites.size) {
        initialGroups['Favoriter'] = Array.from(
          this.props.favorites
        ).map(sign => this.api.getStationBySign(sign));
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
                          station
                            ? this.props.getUrl('station', { station })
                            : '#'
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

          {filteredStations.length === 0 &&
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
                    href={this.props.getUrl('station')}
                    data-pop
                  >
                    <i class="icon icon-back" />
                    <span>Tillbaka</span>
                  </a>
                : locationPermission
                  ? null
                  : <a
                      href="#"
                      class="link icon-only"
                      onClick={event => {
                        if (!isLocating) this.getNearbyStations();
                        event.preventDefault();
                      }}
                      title="Visa närmsta stationer"
                    >
                      {isLocating ? <span class="preloader" /> : <LocateIcon />}
                    </a>}
            </div>
            <div class="center sliding">Välj…</div>
            <div class="right">
              <a
                href={this.props.getUrl('info')}
                class="link icon-only"
                title="Info"
              >
                <InfoIcon />
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
                onClick={event => {
                  this.setState({ searchString: '' });
                  event.preventDefault();
                }}
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
