import { h, Component } from 'preact';
import { getUrl } from '../lib/utils';

export default class Stations extends Component {
  constructor(props) {
    super(props);

    this.api = props.api;
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
    if (!this.state.stations.length)
      this.api.fetchStations().then(stations => this.setState({ stations }));

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
      this.api.fetchAutocompletedTrains(trainsStartingWith).then(trains =>
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

    if (typeof process !== 'undefined') {
      return (<div class="view navbar-through">
        <div class="navbar">
          <div class="navbar-inner hide-when-empty"/>
        </div>
        <div class="page">
          <div class="page-content hide-when-empty"/>
        </div>
      </div>);
    }

    const isTrainNumberSearch = /^\d+$/.test(searchString);
    let listGroups;
    if (isTrainNumberSearch) {
      listGroups = (
        <div class="list-group">
          <ul>
            <li class="list-group-title">
              <div class="row">
                <div class="col-15">
                  Tåg
                </div>
                <div class="col-15 time">
                  Avg
                </div>
                <div class="col-35">
                  Från
                </div>
                <div class="col-35">
                  Till
                </div>
              </div>
            </li>
            {(trainsBySearchString[searchString] || Array.from(new Array(20)))
              .map(({ train, at, from, to } = {}) => {
                return (
                  <li>
                    <a
                      href={train ? getUrl.call(this, 'train', { train }) : '#'}
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

      const filteredStations = stations.filter(station =>
        station.name.toLowerCase().includes(searchString.toLowerCase())
      );
      const groups = filteredStations.reduce((groups, station) => {
        const group = station.name[0];
        groups[group] = groups[group] || [];
        groups[group].push(station);
        return groups;
      }, initialGroups);

      let before, match, after;
      const rSearchString = new RegExp(
        `^(.*?)(?:(${searchString})(.*))?$`,
        'i'
      );
      listGroups = (
        <div>
          {Object.keys(groups).map(group => (
            <div class="list-group">
              <ul>
                <li class="list-group-title">{group}</li>
                {groups[group].map(station => {
                  return (
                    <li>
                      <a
                        href={
                          station
                            ? getUrl.call(this, 'station', { station })
                            : '#'
                        }
                        class="item-link"
                      >
                        <label class="label-radio item-content">
                          <input
                            type="checkbox"
                            name="station"
                            value={station.name}
                            checked={
                              station.name === this.props.station
                                ? 'checked'
                                : null
                            }
                          />
                          <div class="item-inner">
                            {searchString
                              ? (([, before, match, after] = station.name.match(
                                  rSearchString
                                )), (
                                  <div>
                                    {before}<b>{match}</b>{after}
                                  </div>
                                ))
                              : station.name}
                          </div>
                        </label>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

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
                    href={getUrl.call(this, 'station')}
                    onClick={event => {
                      history.back();
                      event.preventDefault();
                    }}
                  >
                    <i class="icon icon-back" />
                    <span>
                      Tillbaka
                    </span>
                  </a>
                : locationPermission
                    ? null
                    : <a
                        href="#"
                        class="link icon-only"
                        onClick={event => event.preventDefault()}
                      >
                        {isLocating
                          ? <span class="preloader" />
                          : <i
                              class="f7-icons"
                              onClick={this.getNearbyStations}
                            >
                              navigation
                            </i>}
                      </a>}
            </div>
            <div class="center sliding">Välj…{typeof process !== 'undefined' && 'ssr'}</div>
            <div class="right">
              <a href="/info" class="link icon-only">
                <i class="f7-icons">info</i>
              </a>
            </div>

          </div>
        </div>
        <div class="page">
          <form
            class={`searchbar searchbar-init ${searchFocused || searchString ? 'searchbar-active' : ''} ${searchString ? 'searchbar-not-empty' : ''}`}
            onSubmit={event => event.preventDefault()}
          >
            <div class="searchbar-input">
              <input
                class=""
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
                onClick={() => this.setState({ searchString: '' })}
              />
            </div>
          </form>

          <div
            class={`searchbar-overlay ${searchFocused && !searchString ? 'searchbar-overlay-active' : ''}`}
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
