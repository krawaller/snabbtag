export default class API {
  MAX_RETRY_COUNT = 5;
  CHECK_INTERVAL = 30000;

  constructor() {
    this.stations = [];
    this.stationsBySignature = {};
    this.stationsByName = {};
  }

  init() {
    this.setStations(JSON.parse(localStorage.getItem('stations')) || undefined);
  }

  query(query) {
    return fetch('https://api.trafikinfo.trafikverket.se/v1.1/data.json', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml'
      },
      body: `
        <REQUEST>
          <LOGIN authenticationkey="b87844ecdc764190bd6b6d86e6b80016" />
          ${query}
        </REQUEST>`.replace(/>\s+?</g, '><')
    }).then(response => response.json());
  }

  setStations(stations = []) {
    console.log({ stations });
    stations.forEach((station = {}) => {
      this.stationsBySignature[station.sign.toLowerCase()] = station;
      this.stationsByName[station.name.toLowerCase()] = station;
    });
    this.stations = stations.filter(station => station.swe);
    return this.stations;
  }

  extractDate(dateStr) {
    return (dateStr && dateStr.substring(0, 10)) || null;
  }
  extractTime(dateStr) {
    return (dateStr && dateStr.substring(11, 16)) || null;
  }

  getStationBySign(signOrName) {
    const lowerSignOrName = signOrName.toLowerCase();
    return (
      this.stationsBySignature[lowerSignOrName] ||
      this.stationsByName[lowerSignOrName] ||
      null
    );
  }

  fetchLocationPermission() {
    return navigator.permissions
      ? navigator.permissions
          .query({ name: 'geolocation' })
          .then(({ state }) => state === 'granted')
      : Promise.resolve(false);
  }

  getClosestStations([{ lat, lng }, stations]) {
    const R = 6378137;
    const PI_360 = Math.PI / 360;
    const haversine = (a, b) => {
      const cLat = Math.cos((a.lat + b.lat) * PI_360);
      const dLat = (b.lat - a.lat) * PI_360;
      const dLng = (b.lng - a.lng) * PI_360;

      const f = dLat * dLat + cLat * cLat * dLng * dLng;
      const c = 2 * Math.atan2(Math.sqrt(f), Math.sqrt(1 - f));

      return R * c;
    };

    return stations
      .map(station => ({
        d: haversine({ lat, lng }, station),
        station
      }))
      .sort((a, b) => a.d - b.d)
      .map(({ station }) => station);
  }

  fetchClosestStations(callback) {
    return Promise.all([
      this.fetchGeoLocation().catch(error => {
        return this.fetchGeoIPLocation();
      }),
      this.fetchStations()
    ]).then(this.getClosestStations);
  }

  fetchGeoLocation() {
    return new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        maximumAge: 3600 * 1000
      })
    ).then(({ coords: { latitude: lat, longitude: lng } }) => ({ lat, lng }));
  }

  fetchGeoIPLocation() {
    return fetch('https://freegeoip.net/json/')
      .then(response => response.json())
      .then(({ latitude: lat, longitude: lng }) => ({ lat, lng }));
  }

  fetchClosestStationsUsingGeoIP() {
    return Promise.all([this.fetchGeoIPLocation(), this.fetchStations()]);
  }

  fetchStations() {
    if (this.stations.length) return Promise.resolve(this.stations);

    return this.query(
      `
      <QUERY objecttype="TrainStation" orderby="AdvertisedShortLocationName">
        <INCLUDE>LocationSignature</INCLUDE>
        <INCLUDE>AdvertisedShortLocationName</INCLUDE>
        <INCLUDE>Geometry.WGS84</INCLUDE>
        <INCLUDE>CountryCode</INCLUDE>
        <FILTER>
          <EQ name="Advertised" value="TRUE" />
        </FILTER>
      </QUERY>`
    ).then(json => {
      const stations = json.RESPONSE.RESULT[0].TrainStation.map(s => {
        const [_, lng, lat] = s.Geometry.WGS84.match(
          /^POINT \(([\d.]+) ([\d.]+)/
        );
        return {
          name: s.AdvertisedShortLocationName,
          sign: s.LocationSignature,
          lat: Number(lat),
          lng: Number(lng),
          swe: s.CountryCode === 'SE'
        };
      });

      this.setStations(stations);
      localStorage.setItem('stations', JSON.stringify(stations));
      return stations;
    });
  }
}
