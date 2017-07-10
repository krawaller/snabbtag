import stations from './stations.json';

export default class API {
  MAX_RETRY_COUNT = 5;
  CHECK_INTERVAL = 30000;

  constructor() {
    this.stations = stations;
    this.stationsBySignature = {};
    this.stationsByName = {};
    stations.forEach((station = {}) => {
      this.stationsBySignature[station.sign.toLowerCase()] = station;
      this.stationsByName[station.name.toLowerCase()] = station;
    });
  }

  init() {
    // this.setStations(JSON.parse(localStorage.getItem('stations')) || undefined);
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

  // setStations(stations = []) {
  //   console.log({ stations });
  //   stations.forEach((station = {}) => {
  //     this.stationsBySignature[station.sign.toLowerCase()] = station;
  //     this.stationsByName[station.name.toLowerCase()] = station;
  //   });
  //   this.stations = stations;
  //   return this.stations;
  // }

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

  getClosestStations({ lat, lng }) {
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

    return this.stations
      .map(station => ({
        d: haversine({ lat, lng }, station),
        station
      }))
      .sort((a, b) => a.d - b.d)
      .map(({ station }) => station);
  }

  fetchClosestStations(numberOfStations = 3, radius = 50000) {
    return this.fetchGeoLocation().catch(error => {
      return this.fetchGeoIPLocation();
    })
    .then(({ lat, lng }) =>
      this.query(`
      <QUERY objecttype="TrainStation" limit="${numberOfStations}">
        <INCLUDE>LocationSignature</INCLUDE>
        <FILTER>
          <WITHIN name="Geometry.WGS84" shape="center" value="${lng} ${lat}" radius="${radius}m" />
        </FILTER>
      </QUERY>`
    ))
    .then(response => response.RESPONSE.RESULT[0].TrainStation.map(({ LocationSignature }) => api.getStationBySign(LocationSignature)))
  }

  fetchClosestStationsUsingGeoIP() {
    return Promise.all([
      this.fetchGeoIPLocation(),
      // this.fetchStations()
    ]);
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



  // fetchStations() {
  //   if (this.stations.length) return Promise.resolve(this.stations);

  //   return this.query(
  //     `
  //     <QUERY objecttype="TrainStation" orderby="AdvertisedShortLocationName">
  //       <INCLUDE>LocationSignature</INCLUDE>
  //       <INCLUDE>AdvertisedShortLocationName</INCLUDE>
  //       <INCLUDE>Geometry.WGS84</INCLUDE>
  //       <INCLUDE>CountryCode</INCLUDE>
  //       <FILTER>
  //         <EQ name="Advertised" value="TRUE" />
  //       </FILTER>
  //     </QUERY>`
  //   ).then(json => {
  //     const stations = json.RESPONSE.RESULT[0].TrainStation.map(s => {
  //       const [_, lng, lat] = s.Geometry.WGS84.match(
  //         /^POINT \(([\d.]+) ([\d.]+)/
  //       );
  //       return {
  //         name: s.AdvertisedShortLocationName,
  //         sign: s.LocationSignature,
  //         lat: Number(Number(lat).toFixed(6)),
  //         lng: Number(Number(lng).toFixed(6)),
  //       };
  //     });

  //     this.setStations(stations);
  //     localStorage.setItem('stations', JSON.stringify(stations));
  //     return stations;
  //   });
  // }
}


// (async function() {
//   const departuresBySignature = window.d = {};
//   api.stations.forEach(async ({ sign }) => {
//     const {
//       RESPONSE: {
//         RESULT: [{
//           TrainAnnouncement: {
//             length: count = 0
//           } = {}
//         }]
//       }
//     } = await api.query(`<QUERY objecttype="TrainAnnouncement">
//         <INCLUDE>AdvertisedTrainIdent</INCLUDE>
//         <FILTER>
//           <EQ name="Advertised" value="TRUE" />
//           <EQ name="LocationSignature" value="${sign}" />
//           <EQ name="ActivityType" value="Avgang" />
//         </FILTER>
//       </QUERY>`);
//     departuresBySignature[sign] = count;
//     await new Promise(resolve => setTimeout(resolve, 200))
//     console.log('done', sign)
//   })
//   console.log({departuresBySignature})  
// })()

// var a = [];
// a.reduce()
// // [].reduce()


// Object.values(temp1.RESPONSE.RESULT[0].TrainAnnouncement.reduce((all, d) => {
//   all[d.AdvertisedTrainIdent] = {
//     from: Array.from(new Set((d.FromLocation || []).map(({ LocationName }) => LocationName).concat((all[d.AdvertisedTrainIdent] || {}).from || []))),
//     to: Array.from(new Set((d.ToLocation || []).map(({ LocationName }) => LocationName).concat((all[d.AdvertisedTrainIdent] || {}).to || []))),
//     via: Array.from(new Set(
//       (d.ViaFromLocation || []).map(({ LocationName }) => LocationName).concat((d.ViaToLocation || []).map(({ LocationName }) => LocationName)).concat((all[d.AdvertisedTrainIdent] || {}).via || [])
//     ))
//   };
//   return all;
// }, {}).reduce((all, d) => {
//   (d.from || []).concat(d.to || []).forEach(s => {
//     all[s] = (all[s] || 0) + 2
//   })

//   (d.via || []).forEach(s => {
//     all[s] = (all[s] || 0) + 1
//   })

//   return all;
// }, {})




// api.stations.
// api.stations[0].sign
