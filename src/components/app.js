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
  }

  getCurrentUrl() {
    const { pathname = '', search = '' } = typeof location !== 'undefined' ? location : {};
    return `${pathname}${search}`;
  }

  componentDidMount() {
    console.log('add')
    addEventListener('click', this.delegateLinkHandler)
    addEventListener('popstate', () => routeTo(getCurrentUrl()));
  }

  componentWillUnmount() {
    removeEventListener('click', this.delegateLinkHandler)
  }

  delegateLinkHandler = e => {
    // ignore events the browser takes care of already:
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.button!==0) return;

    let t = e.target;
    do {
      if (/^a$/i.test(t.nodeName) && t.href) {
        // if link is handled by the router, prevent browser defaults
        console.log('route?', t)

        const href = t.getAttribute('href');
		    const target = t.getAttribute('target');

	      // ignore links with targets and non-path URLs
	      if (!href.match(/^\//g) || (target && !target.match(/^_?self$/i))) continue;
        history.pushState(null, null, href);
        this.forceUpdate();
        
        return;
        // if (routeFromLink(t)) {
        //   return prevent(e);
        // }
      }
    } while ((t=t.parentNode));
  }

  getRoute() {
    const url = this.getCurrentUrl();
    let matches;
    if (/^\/info/.test(url)) return <Info />
    if (/^\/?$|^\/stations($|\?)/.test(url)) return <Stations api={api} getUrl={getUrl} />
    if (matches = url.match(/^\/stations\/([^\/]*)(?:\/?([^\/]*))/)) {
      const [, station, type] = matches;
      return <Station station={decodeURIComponent(station)} type={type} api={api} getUrl={getUrl} getNearbyHumanDate={getNearbyHumanDate} />
    }
    if (matches = url.match(/^\/trains\/(\d+)(?:\/(\d{4}-\d{2}-\d{2}))?|^\/stations\/([^\/]*)\/trains\/(\d+)(?:\/(\d{4}-\d{2}-\d{2}))?/)) {
      const [, train, date] = matches;
      return <Train
        train={train} date={date}
        api={api}
        getUrl={getUrl}
        getNearbyHumanDate={getNearbyHumanDate}
      />
    }
  }

  render = () => {
    return this.getRoute();
    //   <Train
    //     path="/stations/:station/trains/:train/:date?"
    //     api={api}
    //     getUrl={getUrl}
    //   /> 
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
