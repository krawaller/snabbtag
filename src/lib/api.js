if (!Object.values) Object.values = o => Object.keys(o).map(k => o[k]);
import stations from './stations.json';

export default class API {
  MAX_RETRY_COUNT = 5;
  CHECK_INTERVAL = 30000;
  TTL = 20000;

  queries = {};

  constructor() {
    this.stations = Object.values(stations);
    this.stationsBySign = stations;
    this.signsByStation = {};
    for (var sign in stations) {
      this.signsByStation[stations[sign].toLowerCase()] = sign;
    }
  }

  query(query) {
    if (this.queries[query]) return Promise.resolve(this.queries[query].response);

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
    })
      .then(response => response.json())
      .then(({ RESPONSE: { RESULT: [response = null] = [] } = {} }) => {
        this.queries[query] = {
          response,
          timeout: setTimeout(() => {
            delete this.queries[query];
          }, this.TTL)
        };
        return response;
      });
  }

  extractDate(dateStr) {
    return (dateStr && dateStr.substring(0, 10)) || null;
  }
  extractTime(dateStr) {
    return (dateStr && dateStr.substring(11, 16)) || null;
  }

  getStationBySign(input) {
    const lowerInput = input.toLowerCase();
    return lowerInput in this.signsByStation
      ? input
      : this.stationsBySign[lowerInput];
  }

  getSignByStation(input) {
    const lowerInput = input.toLowerCase();
    return lowerInput in this.stationsBySign
      ? lowerInput
      : this.signsByStation[lowerInput];
  }

  fetchLocationPermission() {
    return navigator.permissions
      ? navigator.permissions
          .query({ name: 'geolocation' })
          .then(({ state }) => state === 'granted')
      : Promise.resolve(false);
  }

  fetchClosestStations(numberOfStations = 3, radius = 50000) {
    return this.fetchGeoLocation()
      .catch(error => {
        return this.fetchGeoIPLocation();
      })
      .then(({ lat, lng }) =>
        this.query(`
      <QUERY objecttype="TrainStation" limit="${numberOfStations}">
        <INCLUDE>LocationSignature</INCLUDE>
        <FILTER>
          <AND>
            <WITHIN name="Geometry.WGS84" shape="center" value="${lng} ${lat}" radius="${radius}m" />
            <IN name="LocationSignature" value="${Object.keys(
              api.stationsBySign
            )}" />
          </AND>
        </FILTER>
      </QUERY>`)
      )
      .then(response =>
        response.TrainStation.map(({ LocationSignature }) =>
          api.getStationBySign(LocationSignature)
        )
      );
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
// }, {})).reduce((all, d) => {
//   (d.from || []).concat(d.to || []).forEach(s => {
//     all[s] = (all[s] || 0) + 2
//   });

//   (d.via || []).forEach(s => {
//     all[s] = (all[s] || 0) + 1
//   });

//   return all;
// }, {})

// api.stations.
// api.stations[0].sign
