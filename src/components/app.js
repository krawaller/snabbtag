import { h, Component } from 'preact';
// import { Router } from 'preact-router';
import Stations from '../routes/Stations';
import Station from '../routes/Station';
import Train from '../routes/Train';
import Info from '../routes/Info';
import API from '../lib/api';
import { getUrl, getNearbyHumanDate } from '../lib/utils';
const api = (global.api = new API());

export default class App extends Component {
  componentDidMount() {
    document.body.classList.add('framework7-root');
    document.documentElement.classList.add(
      `pixel-ratio-${Math.floor(window.devicePixelRatio || 1)}`
    );
    
    document.addEventListener('gesturestart', event => event.preventDefault());
    addEventListener('click', this.delegateLinkHandler);
    addEventListener('popstate', () => this.forceUpdate());
  }

  getCurrentUrl() {
    const { pathname = '', search = '' } =
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

        this.route(href);
        event.preventDefault();
        return;
      }
    } while ((t = t.parentNode));
  };

  route(href) {
    history.pushState(null, null, href);
    this.forceUpdate();
    
  }

  getRoute(url = this.getCurrentUrl()) {
    console.log({ url });
    const props = {
      ...((url.match(/(?:\?([^#]*))?(#.*)?$/) || [,])[1] || '')
        .split('&')
        .reduce((params, p) => {
          const [name, value] = p.split('=').map(decodeURIComponent);
          params[name] = value;
          return params;
        }, {}),
      api,
      getUrl,
      getNearbyHumanDate,
      route: this.route.bind(this)
    };

    let matches;
    let Component;

    //TODO: fix simplified urls
    if (/^\/info/.test(url)) Component = Info;
    else if (/^\/?$|^\/stationer($|\?)/.test(url)) Component = Stations;
    else if (
      (matches = url.match(
        /^\/(?:(\d+)|(?:([^\/?]*?)\/)(\d+))(?:\/(\d{4}-\d{2}-\d{2}))?/
      ))
    ) {
      const [, train1, encodedStation, train = train1, date, station = encodedStation && decodeURIComponent(encodedStation)] = matches;
      console.log({matches,train,date,station})
      Component = Train;
      Object.assign(props, { train, date, station });
    }
    else if ((matches = url.match(/^\/(?:stationer\/)?([^\/?]*)(?:\/?([^\/?]*))/))) {
      console.log({matches})
      let [, encodedStation, typ, station = decodeURIComponent(encodedStation)] = matches;
      if (api.getSignByStation(station) === station.toLowerCase()) {
        station = api.getStationBySign(station);
      }

      Component = Station;
      Object.assign(props, { station, typ });
    }
    console.log(props);
    return Component ? <Component {...props} /> : null;
  }

  render = () => {
    return this.getRoute();
  };

  // <Router>
  //   <Info path="/info" />
  //   <Stations path="/stations" api={api} getUrl={getUrl} default />
  //   <Station
  //     path="/stations/:station/:type?"
  //     api={api}
  //     getUrl={getUrl}
  //     getNearbyHumanDate={getNearbyHumanDate}
  //   />
  //   <Train
  //     path="/trains/:train/:date?"
  //     api={api}
  //     getUrl={getUrl}
  //     getNearbyHumanDate={getNearbyHumanDate}
  //   />
  //   <Train
  //     path="/stations/:station/trains/:train/:date?"
  //     api={api}
  //     getUrl={getUrl}
  //   />
  // </Router>;
}
