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
    document.addEventListener('gesturestart', event => event.preventDefault());
    document.body.classList.add('framework7-root');
    document.documentElement.classList.add(
      `pixel-ratio-${Math.floor(window.devicePixelRatio || 1)}`
    );
    this.forceUpdate = this.forceUpdate.bind(this);
  }

  getCurrentUrl() {
    const { pathname = '', search = '' } = typeof location !== 'undefined' ? location : {};
    return `${pathname}${search}`;
  }

  componentDidMount() {
    //TODO: redirect in no getRoute
    console.log('add')
    addEventListener('click', this.delegateLinkHandler)
    addEventListener('popstate', this.forceUpdate);
  }

  componentWillUnmount() {
    removeEventListener('click', this.delegateLinkHandler)
    removeEventListener('popstate', this.forceUpdate);
  }

  delegateLinkHandler = event => {
    // ignore events the browser takes care of already:
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.button!==0) return;

    let t = event.target;
    do {
      if (/^a$/i.test(t.nodeName) && t.href) {
        const href = t.getAttribute('href');
		    const target = t.getAttribute('target');

	      if (!href.match(/^\//g) || (target && !target.match(/^_?self$/i)) || !this.getRoute(href)) continue;
        
        history.pushState(null, null, href);
        this.forceUpdate();
        event.preventDefault();
        return;
      }
    } while ((t=t.parentNode));
  }

  getRoute(url = this.getCurrentUrl()) {
    console.log({url})
    const props = {
      ...((url.match(/(?:\?([^#]*))?(#.*)?$/) || [ ,])[1] || '').split('&').reduce((params, p) => {
        const [name, value] = p.split('=').map(decodeURIComponent);
        params[name] = value;
        return params;
      }, {}),
      api, getUrl, getNearbyHumanDate,
    };

    let matches;
    let Component;

    //TODO: fix simplified urls
    if (/^\/info/.test(url)) Component = Info;
    if (/^\/?$|^\/stations($|\?)/.test(url)) Component = Stations;
    if (matches = url.match(/^\/stations\/([^\/?]*)(?:\/?([^\/?]*))/)) {
      const [, station, type] = matches.map(decodeURIComponent);
      Component = Station;
      Object.assign(props, { station, type });
    }
    if (matches = url.match(/^\/trains\/(\d+)(?:\/(\d{4}-\d{2}-\d{2}))?|^\/stations\/([^\/]*)\/trains\/(\d+)(?:\/(\d{4}-\d{2}-\d{2}))?/)) {
      const [, train, date] = matches;
      Component = Train;
      Object.assign(props, { train, date });
    }
    console.log({props})
    return Component ? <Component {...props} /> : null;
  }

  render = () => {
    return this.getRoute();
  } 

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
