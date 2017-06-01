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
      body: this.removeXMLWhitespace(
        `
        <REQUEST>
          <LOGIN authenticationkey="b87844ecdc764190bd6b6d86e6b80016" />
          ${query}
        </REQUEST>`
      )
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

  removeXMLWhitespace(xmlString) {
    return xmlString.replace(/>\s+?</g, '><');
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

  fetchStation(
    sign,
    departures,
    filterFavorites,
    favorites,
    lastModified,
    lastAdvertisedTimeAtLocation
  ) {
    return this.query(
      `
      <QUERY objecttype="TrainAnnouncement" orderby="AdvertisedTimeAtLocation" lastmodified="TRUE">
        <FILTER>
          <AND>
            <EQ name="ActivityType" value="${departures ? 'Avgang' : 'Ankomst'}" />
            <EQ name="Advertised" value="TRUE" />
            <EQ name="LocationSignature" value="${sign}" />
            <OR>
              <AND>
                <GT name="AdvertisedTimeAtLocation" value="$dateadd(-00:15:00)" />
                <LT name="AdvertisedTimeAtLocation" value="$dateadd(14:00:00)" />
              </AND>
              <AND>
                <GT name="EstimatedTimeAtLocation" value="$dateadd(-00:15:00)" />
                <LT name="AdvertisedTimeAtLocation" value="$dateadd(00:30:00)" />
              </AND>
            </OR>
            ${lastModified ? `
              <OR>
                <GT name="ModifiedTime" value="${lastModified}"/>
                ${lastAdvertisedTimeAtLocation ? `<GT name="AdvertisedTimeAtLocation" value="${lastAdvertisedTimeAtLocation}"/>` : ''}
              </OR>` : ''}
          </AND>
        </FILTER>
        <INCLUDE>AdvertisedTrainIdent</INCLUDE>
        <INCLUDE>AdvertisedTimeAtLocation</INCLUDE>
        <INCLUDE>EstimatedTimeAtLocation</INCLUDE>
        <INCLUDE>TrackAtLocation</INCLUDE>
        <INCLUDE>ScheduledDepartureDateTime</INCLUDE>
        <INCLUDE>Canceled</INCLUDE>
        <INCLUDE>Deviation</INCLUDE>
        <INCLUDE>ActivityId</INCLUDE>
        <INCLUDE>${departures ? 'ToLocation' : 'FromLocation'}</INCLUDE>
      </QUERY>`
    ).then(
      ({
        RESPONSE: {
          RESULT: [
            {
              TrainAnnouncement: announcements = [],
              INFO: {
                LASTMODIFIED: { '@datetime': lastModified = false } = {}
              } = {}
            }
          ] = []
        }
      }) => {
        if (!filterFavorites || lastModified === false)
          return { announcements, lastModified };

        const filteredFavorites = new Set(favorites);
        filteredFavorites.delete(sign);
        return this.query(
          `
          <QUERY objecttype="TrainAnnouncement" orderby="AdvertisedTimeAtLocation">
            <FILTER>
              <AND>
                <EQ name="ActivityType" value="${!departures ? 'Avgang' : 'Ankomst'}" />
                <EQ name="Advertised" value="TRUE" />
                <IN
                  name="LocationSignature"
                  value="${Array.from(filteredFavorites.values())
                           .map(
                             favorite =>
                               (this.getStationBySign(favorite) || {}).sign
                           )
                           .filter(Boolean)
                           .join(',')}" />
                <IN
                  name="AdvertisedTrainIdent"
                  value="${announcements
                           .map(
                             ({ AdvertisedTrainIdent }) => AdvertisedTrainIdent
                           )
                           .join(',')}" />
              </AND>
            </FILTER>
            <INCLUDE>AdvertisedTrainIdent</INCLUDE>
            <INCLUDE>ScheduledDepartureDateTime</INCLUDE>
            <INCLUDE>AdvertisedTimeAtLocation</INCLUDE>
          </QUERY>`
        ).then(
          ({
            RESPONSE: {
              RESULT: [{ TrainAnnouncement: filterAnnouncements = [] }] = []
            }
          }) => {
            const filterMap = filterAnnouncements.reduce((o, announcement) => {
              if (o[announcement.ScheduledDepartureDateTime] === undefined) {
                o[announcement.ScheduledDepartureDateTime] = {};
              }
              o[announcement.ScheduledDepartureDateTime][
                announcement.AdvertisedTrainIdent
              ] =
                announcement.AdvertisedTimeAtLocation;
              return o;
            }, {});

            return {
              announcements: announcements.filter(announcement => {
                const filteredAdvertisedTimeAtLocation =
                  filterMap[announcement.ScheduledDepartureDateTime] &&
                  filterMap[announcement.ScheduledDepartureDateTime][
                    announcement.AdvertisedTrainIdent
                  ];
                return departures
                  ? filteredAdvertisedTimeAtLocation >
                      announcement.AdvertisedTimeAtLocation
                  : filteredAdvertisedTimeAtLocation <
                      announcement.AdvertisedTimeAtLocation;
              }),
              hasUnfilteredAnnouncements: !!announcements.length,
              lastModified
            };
          }
        );
      }
    );
  }

  fetchTrain(train, date, lastModified) {
    return this.query(
      `
      <QUERY objecttype="TrainAnnouncement" orderby="AdvertisedTimeAtLocation" lastmodified="TRUE">
        <INCLUDE>LocationSignature</INCLUDE>
        <INCLUDE>ActivityType</INCLUDE>
        <INCLUDE>AdvertisedTimeAtLocation</INCLUDE>
        <INCLUDE>EstimatedTimeAtLocation</INCLUDE>
        <INCLUDE>TimeAtLocation</INCLUDE>
        <INCLUDE>TrackAtLocation</INCLUDE>
        <INCLUDE>Canceled</INCLUDE>
        <INCLUDE>Deviation</INCLUDE>
        <FILTER>
          <EQ name="AdvertisedTrainIdent" value="${train}" />
          <EQ name="Advertised" value="TRUE" />
          <EQ name="ScheduledDepartureDateTime" value="${date}" />
          ${lastModified ? `<GT name="ModifiedTime" value="${lastModified}"/>` : ''}
        </FILTER>
      </QUERY>`
    ).then(
      ({
        RESPONSE: {
          RESULT: [
            {
              TrainAnnouncement = [],
              INFO: {
                LASTMODIFIED: { '@datetime': lastModified = false } = {}
              } = {}
            }
          ]
        }
      }) => ({ announcements: TrainAnnouncement, lastModified })
    );
  }

  fetchAutocompletedTrains(trainsStartingWith) {
    return this.query(
      `
      <QUERY objecttype="TrainAnnouncement">
        <FILTER>
          <EQ name="Advertised" value="true" />
          <EQ name="ActivityType" value="Avgang" />
          <LIKE name="AdvertisedTrainIdent" value="/^${trainsStartingWith}/" />
          <EQ name="ScheduledDepartureDateTime" value="${new Intl.DateTimeFormat('sv-SE').format(new Date())}" />
        </FILTER>
        <INCLUDE>AdvertisedTrainIdent</INCLUDE>
        <INCLUDE>FromLocation</INCLUDE>
        <INCLUDE>ToLocation</INCLUDE>
        <INCLUDE>AdvertisedTimeAtLocation</INCLUDE>
      </QUERY>`
    ).then(({ RESPONSE: { RESULT: [{ TrainAnnouncement = [] }] } }) =>
      Object.values(
        TrainAnnouncement.reduce((trains, t) => {
          if (!(t.AdvertisedTrainIdent in trains)) {
            trains[t.AdvertisedTrainIdent] = {
              train: t.AdvertisedTrainIdent,
              from: this.getStationBySign(t.FromLocation[0].LocationName).name,
              to: this.getStationBySign(t.ToLocation[0].LocationName).name,
              at: this.extractTime(t.AdvertisedTimeAtLocation)
            };
          }
          return trains;
        }, {})
      )
    );
  }

  subscribeStation(sign, departures, filterFavorites, favorites, callback) {
    let checkTimeout;
    let cancelled = false;
    let formattedAnnouncementsById = {};
    let currentLastModified;
    let currentLastAdvertisedTimeAtLocation;
    let isChecking = false;
    let retryCount = 0;

    const handleVisibilityChange = () => {
      if (!document.hidden) check();
    };

    const cancel = () => {
      cancelled = true;
      clearTimeout(checkTimeout);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', check);
    };

    const check = () => {
      if (isChecking) return;
      isChecking = true;
      const dt = new Date();
      dt.setMinutes(dt.getMinutes() - 15);
      const maxDate = new Intl.DateTimeFormat('sv-SE', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric'
      })
        .format(dt)
        .replace(' ', 'T');

      this.fetchStation(
        sign,
        departures,
        filterFavorites,
        favorites,
        currentLastModified,
        currentLastAdvertisedTimeAtLocation
      ).then(
        ({ announcements, hasUnfilteredAnnouncements, lastModified }) => {
          if (cancelled) return;
          isChecking = false;
          retryCount = 0;

          if (!document.hidden && window.navigator.onLine)
            setTimeout(check, 30000);

          let purged = false;
          for (let id in formattedAnnouncementsById) {
            const {
              AdvertisedTimeAtLocation,
              EstimatedTimeAtLocation
            } = formattedAnnouncementsById[id];
            if (
              AdvertisedTimeAtLocation < maxDate &&
              (!EstimatedTimeAtLocation || EstimatedTimeAtLocation < maxDate)
            ) {
              purged = true;
              delete formattedAnnouncementsById[id];
            }
          }

          if (!purged && lastModified === false) return;

          formattedAnnouncementsById = announcements.reduce(
            (all, announcement, i, arr) => {
              const [
                _,
                date,
                time
              ] = announcement.AdvertisedTimeAtLocation.match(
                /^(\d{4}\-\d{2}-\d{2})T(\d{2}:\d{2})/
              ) || [];

              all[announcement.ActivityId] = {
                name: (this.getStationBySign(
                  (announcement.ToLocation || announcement.FromLocation)[0]
                    .LocationName
                ) || {}).name,
                via: (announcement.ViaToLocation ||
                announcement.ViaFromLocation || [])
                  .map(l => (this.getStationBySign(l.LocationName) || {}).name)
                  .filter(Boolean),
                signs: (announcement.ToLocation || announcement.FromLocation)
                  .map(l => l.LocationName),
                date: this.extractDate(announcement.AdvertisedTimeAtLocation),
                time: this.extractTime(announcement.AdvertisedTimeAtLocation),
                datetime: announcement.AdvertisedTimeAtLocation,
                estimated: this.extractTime(
                  announcement.EstimatedTimeAtLocation
                ),
                train: announcement.AdvertisedTrainIdent,
                track: announcement.TrackAtLocation,
                scheduledDate: this.extractDate(
                  announcement.ScheduledDepartureDateTime
                ),
                cancelled: !!announcement.Canceled,
                deviations: announcement.Deviation,
                AdvertisedTimeAtLocation: announcement.AdvertisedTimeAtLocation,
                EstimatedTimeAtLocation: announcement.EstimatedTimeAtLocation
              };
              return all;
            },
            formattedAnnouncementsById
          );

          if (lastModified) currentLastModified = lastModified;

          announcements = Object.values(formattedAnnouncementsById);
          currentLastAdvertisedTimeAtLocation = (announcements[
            announcements.length - 1
          ] || {}).AdvertisedTimeAtLocation;

          callback({
            announcements,
            hasUnfilteredAnnouncements
          });
        },
        error => {
          isChecking = false;
          if (retryCount++ < this.MAX_RETRY_COUNT)
            setTimeout(check, (1 << retryCount) * 1000);
        }
      );
    };
    check();

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', check);
    return { cancel };
  }

  subscribeTrain(train, date, callback) {
    let checkTimeout;
    let cancelled = false;
    let formattedAnnouncementsBySign = {};
    let currentLastModified;
    let isChecking = false;
    let retryCount = 0;

    const handleVisibilityChange = () => {
      if (!document.hidden) check();
    };

    const cancel = () => {
      cancelled = true;
      clearTimeout(checkTimeout);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', check);
    };

    const check = () => {
      if (isChecking) return;
      isChecking = true;
      this.fetchTrain(train, date, currentLastModified).then(
        ({ announcements, lastModified }) => {
          if (cancelled) return;
          isChecking = false;
          retryCount = 0;

          if (!document.hidden && window.navigator.onLine)
            setTimeout(check, 30000);

          if (lastModified === false || lastModified === currentLastModified)
            return;

          formattedAnnouncementsBySign = announcements.reduce(
            (all, announcement, i, arr) => {
              all[announcement.LocationSignature] = Object.assign(
                all[announcement.LocationSignature] || {},
                {
                  sign: announcement.LocationSignature,
                  name: (this.getStationBySign(
                    announcement.LocationSignature
                  ) || {}).name || null,
                  track: announcement.TrackAtLocation,
                  [announcement.ActivityType === 'Avgang'
                    ? 'departure'
                    : 'arrival']: {
                    date: this.extractDate(announcement.AdvertisedTimeAtLocation),
                    advertised: this.extractTime(
                      announcement.AdvertisedTimeAtLocation
                    ),
                    estimated: this.extractTime(
                      announcement.EstimatedTimeAtLocation
                    ),
                    actual: this.extractTime(announcement.TimeAtLocation),
                    happened: !!announcement.TimeAtLocation ||
                      arr.slice(i + 1).some(({ TimeAtLocation }) => TimeAtLocation),
                    cancelled: !!announcement.Canceled,
                    deviations: announcement.Deviation
                  }
                }
              );
              return all;
            },
            formattedAnnouncementsBySign
          );


          currentLastModified = lastModified;
          const formattedAnnouncements = Object.values(
            formattedAnnouncementsBySign
          );
          console.log({formattedAnnouncements, announcements})

          if (
            (formattedAnnouncements[formattedAnnouncements.length - 1]
              .arrival || {}).happened
          )
            cancel();

          callback(formattedAnnouncements);
        },
        error => {
          isChecking = false;
          if (retryCount++ < this.MAX_RETRY_COUNT)
            setTimeout(check, (1 << retryCount) * 1000);
        }
      );
    };
    check();

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', check);
    return { cancel };
  }
}
