import { h, Component } from 'preact';
import { Router } from 'preact-router';
import Stations from '../routes/Stations';
import Station from '../routes/Station';
import Train from '../routes/Train';
import Info from '../routes/Info';
import SSR from './SSR';
import API from '../lib/api';
import { getUrl, getNearbyHumanDate } from '../lib/utils';
const api = (global.api = new API());
if (typeof process === 'undefined') api.init();

export default class App extends Component {
  componentDidMount() {
    document.addEventListener('gesturestart', event => event.preventDefault());
    document.body.classList.add('framework7-root');
    document.documentElement.classList.add(`pixel-ratio-${Math.floor(window.devicePixelRatio || 1)}`);
  }

  render() {
    if (typeof process !== 'undefined') return <SSR/>;
    return (
      <Router>
        <Info path="/info" />
        <Stations path="/stations" api={api} getUrl={getUrl} default />
        <Station path="/stations/:station/:type?" api={api} getUrl={getUrl} getNearbyHumanDate={getNearbyHumanDate} />
        <Train path="/trains/:train/:date?" api={api} getUrl={getUrl} getNearbyHumanDate={getNearbyHumanDate} />
        <Train path="/stations/:station/trains/:train/:date?" api={api} getUrl={getUrl} />
      </Router>
    );
  }
}