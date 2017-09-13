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
    if (this.queries[query]) return Promise.resolve(this.queries[query]);

    this.queries[
      query
    ] = fetch('https://api.trafikinfo.trafikverket.se/v1.1/data.json', {
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
      .then(
        ({ RESPONSE: { RESULT: [response = null] = [] } = {} }) => response
      );

    const cleanup = () => delete this.queries[query];
    this.queries[query].then(() => setTimeout(cleanup, this.TTL), cleanup);
    return this.queries[query];
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
          ${lastModified
            ? `<GT name="ModifiedTime" value="${lastModified}"/>`
            : ''}
        </FILTER>
      </QUERY>`
    ).then(
      ({
        TrainAnnouncement = [],
        INFO: { LASTMODIFIED: { '@datetime': lastModified = false } = {} } = {}
      }) => ({ announcements: TrainAnnouncement, lastModified })
    );
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
      removeEventListener('visibilitychange', handleVisibilityChange);
      removeEventListener('online', check);
    };

    const check = () => {
      if (isChecking) return;
      isChecking = true;
      this.fetchTrain(train, date, currentLastModified).then(
        ({ announcements, lastModified }) => {
          if (cancelled) return;
          isChecking = false;
          retryCount = 0;

          if (!document.hidden && navigator.onLine)
            checkTimeout = setTimeout(check, this.CHECK_INTERVAL);

          if (lastModified === false || lastModified === currentLastModified)
            return;

          formattedAnnouncementsBySign = announcements.reduce(
            (all, announcement, i, arr) => {
              const current = all[announcement.LocationSignature] || {};
              const rawDeviations = (current.deviations || [])
                .concat(announcement.Deviation || []);

              all[announcement.LocationSignature] = Object.assign(current, {
                sign: announcement.LocationSignature,
                name: this.getStationBySign(announcement.LocationSignature),
                track: announcement.TrackAtLocation,
                deviations: Array.from(
                  new Set(
                    rawDeviations.filter(
                      deviation =>
                        !/^inställ|^prel\. tid|^spårändrat/i.test(deviation)
                    )
                  )
                ),
                trackChanged: !!rawDeviations.find(deviation =>
                  /^spårändrat/i.test(deviation)
                ),
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
                  happened:
                    !!announcement.TimeAtLocation ||
                    arr
                      .slice(i + 1)
                      .some(({ TimeAtLocation }) => TimeAtLocation),
                  cancelled: !!announcement.Canceled,
                  deviations: announcement.Deviation,
                  preliminary:
                    !announcement.TimeAtLocation &&
                    !!(announcement.Deviation || [])
                      .find(deviation => /^prel\. tid/i.test(deviation))
                }
              });
              return all;
            },
            formattedAnnouncementsBySign
          );

          currentLastModified = lastModified;
          const formattedAnnouncements = Object.values(
            formattedAnnouncementsBySign
          );

          if (
            (formattedAnnouncements[formattedAnnouncements.length - 1]
              .arrival || {}).happened
          )
            cancel();

          callback({ announcements: formattedAnnouncements });
        },
        error => {
          isChecking = false;
          if (retryCount++ < this.MAX_RETRY_COUNT)
            checkTimeout = setTimeout(check, (1 << retryCount) * 1000);
        }
      );
    };
    check();

    addEventListener('visibilitychange', handleVisibilityChange);
    addEventListener('online', check);
    return { cancel };
  }

  fetchStation(
    station,
    showingDepartures,
    favorites,
    filter,
    lastModified,
    lastAdvertisedTimeAtLocation
  ) {
    return this.query(
      `
      <QUERY objecttype="TrainAnnouncement" orderby="AdvertisedTimeAtLocation" lastmodified="TRUE">
        <FILTER>
          <AND>
            <EQ name="ActivityType" value="${showingDepartures
              ? 'Avgang'
              : 'Ankomst'}" />
            <EQ name="Advertised" value="TRUE" />
            <EQ name="LocationSignature" value="${this.getSignByStation(
              station
            )}" />
            <OR>
              <AND>
                <GT name="AdvertisedTimeAtLocation" value="$dateadd(-00:10:00)" />
                <LT name="AdvertisedTimeAtLocation" value="$dateadd(14:00:00)" />
              </AND>
              <AND>
                <GT name="EstimatedTimeAtLocation" value="$dateadd(-00:10:00)" />
                <LT name="AdvertisedTimeAtLocation" value="$dateadd(00:30:00)" />
              </AND>
            </OR>
            ${lastModified
              ? `
              <OR>
                <GT name="ModifiedTime" value="${lastModified}"/>
                ${lastAdvertisedTimeAtLocation
                  ? `<GT name="AdvertisedTimeAtLocation" value="${lastAdvertisedTimeAtLocation}"/>`
                  : ''}
              </OR>`
              : ''}
          </AND>
        </FILTER>
        <INCLUDE>AdvertisedTrainIdent</INCLUDE>
        <INCLUDE>AdvertisedTimeAtLocation</INCLUDE>
        <INCLUDE>EstimatedTimeAtLocation</INCLUDE>
        <INCLUDE>TimeAtLocation</INCLUDE>
        <INCLUDE>TrackAtLocation</INCLUDE>
        <INCLUDE>ScheduledDepartureDateTime</INCLUDE>
        <INCLUDE>Canceled</INCLUDE>
        <INCLUDE>Deviation</INCLUDE>
        <INCLUDE>ActivityId</INCLUDE>
        <INCLUDE>ProductInformation</INCLUDE>
        <INCLUDE>TrainComposition</INCLUDE>
        <INCLUDE>${showingDepartures ? 'ToLocation' : 'FromLocation'}</INCLUDE>
      </QUERY>`
    ).then(
      ({
        TrainAnnouncement: announcements = [],
        INFO: { LASTMODIFIED: { '@datetime': lastModified = false } = {} } = {}
      }) => {
        const response = {
          announcements,
          lastModified,
          lastAdvertisedTimeAtLocation: (announcements[
            announcements.length - 1
          ] || {}).AdvertisedTimeAtLocation,
          hasUnfilteredAnnouncements: !!announcements.length
        };
        const rFilter = new RegExp(filter, 'i');

        if (/^\d+$/.test(filter)) {
          return {
            ...response,
            announcements: announcements.filter(({ AdvertisedTrainIdent }) =>
              rFilter.test(AdvertisedTrainIdent)
            )
          };
        }

        if (filter.length < 2 || lastModified === false) return response;

        return this.query(
          `
          <QUERY objecttype="TrainAnnouncement" orderby="AdvertisedTimeAtLocation">
            <FILTER>
              <AND>
                <EQ name="ActivityType" value="${!showingDepartures
                  ? 'Avgang'
                  : 'Ankomst'}" />
                <EQ name="Advertised" value="TRUE" />
                <IN
                  name="AdvertisedTrainIdent"
                  value="${announcements
                    .map(({ AdvertisedTrainIdent }) => AdvertisedTrainIdent)
                    .join(',')}" />
                <IN
                name="LocationSignature"
                value="${Object.keys(this.signsByStation)
                  .filter(station => rFilter.test(station))
                  .map(this.getSignByStation.bind(this))
                  .join(',')}" />
              </AND>
            </FILTER>
            <INCLUDE>AdvertisedTrainIdent</INCLUDE>
            <INCLUDE>ScheduledDepartureDateTime</INCLUDE>
            <INCLUDE>AdvertisedTimeAtLocation</INCLUDE>
          </QUERY>`
        ).then(({ TrainAnnouncement: filterAnnouncements = [] }) => {
          const filterMap = filterAnnouncements.reduce(
            (
              filterMap,
              {
                ScheduledDepartureDateTime,
                AdvertisedTrainIdent,
                AdvertisedTimeAtLocation
              }
            ) => {
              if (filterMap[ScheduledDepartureDateTime] === undefined) {
                filterMap[ScheduledDepartureDateTime] = {};
              }
              filterMap[ScheduledDepartureDateTime][
                AdvertisedTrainIdent
              ] = AdvertisedTimeAtLocation;
              return filterMap;
            },
            {}
          );

          return {
            ...response,
            announcements: announcements.filter(
              ({
                ScheduledDepartureDateTime,
                AdvertisedTrainIdent,
                AdvertisedTimeAtLocation
              }) => {
                const filteredAdvertisedTimeAtLocation =
                  filterMap[ScheduledDepartureDateTime] &&
                  filterMap[ScheduledDepartureDateTime][AdvertisedTrainIdent];
                return showingDepartures
                  ? filteredAdvertisedTimeAtLocation > AdvertisedTimeAtLocation
                  : filteredAdvertisedTimeAtLocation < AdvertisedTimeAtLocation;
              }
            )
          };
        });
      }
    );
  }

  subscribeStation(
    { station, showingDepartures, favorites, filter = '' },
    callback
  ) {
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
      removeEventListener('visibilitychange', handleVisibilityChange);
      removeEventListener('online', check);
    };

    const check = () => {
      if (isChecking) return;
      isChecking = true;
      const dt = new Date();
      dt.setMinutes(dt.getMinutes() - 10);
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
        station,
        showingDepartures,
        favorites,
        filter,
        currentLastModified,
        currentLastAdvertisedTimeAtLocation
      ).then(
        ({
          announcements,
          hasUnfilteredAnnouncements,
          lastModified,
          lastAdvertisedTimeAtLocation
        }) => {
          if (cancelled) return;
          isChecking = false;
          retryCount = 0;

          if (!document.hidden && navigator.onLine)
            checkTimeout = setTimeout(check, this.CHECK_INTERVAL);

          let purged = false;
          for (let id in formattedAnnouncementsById) {
            const {
              AdvertisedTimeAtLocation,
              EstimatedTimeAtLocation,
              removed
            } = formattedAnnouncementsById[id];

            if (removed) {
              purged = true;
              delete formattedAnnouncementsById[id];
              continue;
            }
            if (
              AdvertisedTimeAtLocation < maxDate &&
              (!EstimatedTimeAtLocation || EstimatedTimeAtLocation < maxDate)
            ) {
              purged = formattedAnnouncementsById[id].removed = true;
            }
          }

          if (!purged && lastModified === false) return;

          formattedAnnouncementsById = announcements.reduce(
            (all, announcement, i, arr) => {
              const [_, date, time] =
                announcement.AdvertisedTimeAtLocation.match(
                  /^(\d{4}\-\d{2}-\d{2})T(\d{2}:\d{2})/
                ) || [];

              all[announcement.ActivityId] = {
                name: this.getStationBySign(
                  (announcement.ToLocation || announcement.FromLocation)[0]
                    .LocationName
                ),
                via: (announcement.ViaToLocation ||
                  announcement.ViaFromLocation ||
                  [])
                  .map(l => this.getStationBySign(l.LocationName))
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
                deviations: (announcement.Deviation || [])
                  .filter(
                    deviation =>
                      !/^inställ|^prel\. tid|^spårändrat/i.test(deviation)
                  ),
                preliminary: !!(announcement.Deviation || [])
                  .find(deviation => /^prel\. tid/i.test(deviation)),
                trackChanged: !!(announcement.Deviation || [])
                  .find(deviation => /^spårändrat/i.test(deviation)),
                departed: !!announcement.TimeAtLocation,
                removed: !!(all[announcement.ActivityId] || {}).removed,
                trainType: (announcement.ProductInformation || [''])[0],
                trainComposition: ((announcement.TrainComposition || [])
                  .filter(
                    trainComposition => !/vagnsordning/i.test(trainComposition)
                  )[0] || '')
                  .replace(/.\s*$/, ''),
                AdvertisedTimeAtLocation: announcement.AdvertisedTimeAtLocation,
                EstimatedTimeAtLocation: announcement.EstimatedTimeAtLocation
              };
              return all;
            },
            formattedAnnouncementsById
          );

          if (
            (lastModified && !currentLastModified) ||
            lastModified > currentLastModified
          )
            currentLastModified = lastModified;

          announcements = Object.values(formattedAnnouncementsById);
          currentLastAdvertisedTimeAtLocation = lastAdvertisedTimeAtLocation;
          callback({
            announcements,
            hasUnfilteredAnnouncements
          });
        },
        error => {
          isChecking = false;
          if (retryCount++ < this.MAX_RETRY_COUNT)
            checkTimeout = setTimeout(check, (1 << retryCount) * 1000);
        }
      );
    };
    check();

    addEventListener('visibilitychange', handleVisibilityChange);
    addEventListener('online', check);
    return { cancel };
  }

  fetchAutocompletedTrains(trainsStartingWith) {
    return this.query(
      `
      <QUERY objecttype="TrainAnnouncement" limit="100">
        <FILTER>
          <EQ name="Advertised" value="true" />
          <EQ name="ActivityType" value="Avgang" />
          <LIKE name="AdvertisedTrainIdent" value="/^${trainsStartingWith}/" />
          <EQ name="ScheduledDepartureDateTime" value="${new Intl.DateTimeFormat(
            'sv-SE'
          ).format(new Date())}" />
        </FILTER>
        <INCLUDE>AdvertisedTrainIdent</INCLUDE>
        <INCLUDE>FromLocation</INCLUDE>
        <INCLUDE>ToLocation</INCLUDE>
        <INCLUDE>AdvertisedTimeAtLocation</INCLUDE>
      </QUERY>`
    ).then(({ TrainAnnouncement = [] }) =>
      Object.values(
        TrainAnnouncement.reduce((trains, t) => {
          if (!(t.AdvertisedTrainIdent in trains)) {
            trains[t.AdvertisedTrainIdent] = {
              train: t.AdvertisedTrainIdent,
              from: this.getStationBySign(t.FromLocation[0].LocationName),
              to: this.getStationBySign(t.ToLocation[0].LocationName),
              at: this.extractTime(t.AdvertisedTimeAtLocation)
            };
          }
          return trains;
        }, {})
      )
    );
  }
}
