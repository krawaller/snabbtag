import { h, Component } from 'preact';
import Stations from './Stations';
import Station from './Station';
import Train from './Train';
import Info from './Info';
import API from '../lib/api';
import { getUrl, getNearbyHumanDate } from '../lib/utils';
const api = (global.api = new API());

const normalizeUrl = url => {
  if (typeof document === 'undefined') {
    return url;
  } else {
    const a = document.createElement('a');
    a.setAttribute('href', url);
    return a.href;
  }
};

export default class App extends Component {
  state = {
    popped: false,
    url: this.getCurrentUrl(),
    scrollTopByUrl: {}
  };

  componentDidMount() {
    document.body.classList.add('framework7-root');
    document.documentElement.classList.add(
      `pixel-ratio-${Math.floor(devicePixelRatio || 1)}`
    );

    document.addEventListener('gesturestart', event => event.preventDefault());
    addEventListener('click', this.delegateLinkHandler);
    addEventListener('popstate', () => {
      this.setState({
        popped: true,
        url: this.getCurrentUrl()
      });
      this.forceUpdate();
    });
  }

  getCurrentUrl() {
    const { pathname = '/', search = '' } =
      typeof location !== 'undefined' ? location : {};
    return `${pathname}${search}`;
  }

  delegateLinkHandler = event => {
    // ignore events the browser takes care of already:
    if (
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey ||
      event.button !== 0
    )
      return;

    let t = event.target;
    do {
      if (/^a$/i.test(t.nodeName) && t.href) {
        const href = t.getAttribute('href');
        const target = t.getAttribute('target');

        if (
          !href.match(/^\//g) ||
          (target && !target.match(/^_?self$/i)) ||
          !this.getRoute(href)
        )
          continue;

        this.route(href, t && t.hasAttribute('data-pop'));
        event.preventDefault();
        return;
      }
    } while ((t = t.parentNode));
  };

  route(url, popped = false, replace = false) {
    this.setState({
      popped,
      scrollTopByUrl: {
        ...this.state.scrollTopByUrl,
        [normalizeUrl(this.state.url)]: {
          at: Date.now(),
          value: (this.base.querySelector('.page-content') || {}).scrollTop || 0
        }
      },
      url
    });
    history[`${replace ? 'replace' : 'push'}State`](null, null, url);
    this.forceUpdate();
  }

  getRoute(url = this.getCurrentUrl()) {
    const params = ((url.match(/(?:\?([^#]*))?(#.*)?$/) || [,])[1] || '')
      .split('&')
      .reduce((params, p) => {
        const [name, value] = p.split('=').map(decodeURIComponent);
        params[name] = value;
        return params;
      }, {});

    const scrollTopObject = this.state.scrollTopByUrl[normalizeUrl(url)];
    const props = {
      type: params.typ,
      ...params,
      api,
      getUrl,
      getNearbyHumanDate,
      route: this.route.bind(this),
      scrollTop:
        this.state.popped &&
        scrollTopObject &&
        Date.now() - scrollTopObject.at < api.TTL &&
        scrollTopObject.value
    };

    let matches, Component;
    if (/^\/info/.test(url)) Component = Info;
    else if (/^\/?$|^\/stationer($|\?)/.test(url)) Component = Stations;
    else if (
      (matches = url.match(
        /^\/(?:(\d+)|(?:([^/?]*?)\/)(\d+))(?:\/(\d{4}-\d{2}-\d{2}))?/
      ))
    ) {
      const [
        ,
        train1,
        encodedStation,
        train = train1,
        date,
        station = encodedStation && decodeURIComponent(encodedStation)
      ] = matches;
      Component = Train;
      Object.assign(props, { train, date, station });
    } else if (
      (matches = url.match(/^\/(?:stationer\/)?([^/?]*)(?:\/?([^/?]*))/))
    ) {
      let [
        ,
        encodedStation,
        type,
        station = decodeURIComponent(encodedStation)
      ] = matches;
      if (api.getSignByStation(station) === station.toLowerCase()) {
        station = api.getStationBySign(station);
      }

      Component = Station;
      Object.assign(props, { station, type });
    }

    return Component ? (
      <Component
        {...{
          ...props,
          favorites: new Set(
            (props.favoriter || '').split(',').filter(Boolean)
          ),
          showingDepartures: props.type !== 'ankomster'
        }}
      />
    ) : null;
  }

  render = () => {
    return this.getRoute();
  };
}
