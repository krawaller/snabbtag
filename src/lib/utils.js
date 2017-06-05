export function getUrl(
  page,
  {
    station = (this.state && this.state.station) || this.props.station,
    train = (this.state && this.state.train) || this.props.train,
    date = (this.state && this.state.date) || this.props.date,
    favorites = (this.state && this.state.favorites) || this.props.favorites,
    favoriteTrafficOnly = (this.state && this.state.favoriteTrafficOnly) ||
      this.props.favoriteTrafficOnly,
    showingDepartures = (this.state && this.state.showingDepartures) ||
      this.props.showingDepartures ||
      this.props.type !== 'arrivals'
  } = {}
) {
  const queries = [
    favorites instanceof Set && favorites.size
      ? `favorites=${Array.from(favorites).join(',')}`
      : '',
    typeof favorites === 'string' ? `favorites=${favorites}` : '',
    favoriteTrafficOnly ? `favorite_traffic_only=true` : '',
    station && (page === 'stations' || page === 'train')
      ? `station=${station.name || station}`
      : '',
    (page === 'stations' || page === 'train') &&
      !showingDepartures &&
      'type=arrivals'
  ]
    .filter(Boolean)
    .join('&');

  return `${{
    station: `/stations/${(station && station.name) ||
      station}/${showingDepartures ? 'departures' : 'arrivals'}`,
    stations: `/stations`,
    train: `/trains/${train}${date ? `/${date}` : ''}`
  }[page]}${queries && `?${queries}`}`;
}

export function getNearbyHumanDate(dateString) {
  let tmp;
  const dateTimeFormat = new Intl.DateTimeFormat('sv-SE');
  return (
    {
      [(
        (tmp = new Date()),
        tmp.setDate(tmp.getDate() - 2),
        dateTimeFormat.format(tmp)
      )]: 'i förrgår',
      [(
        (tmp = new Date()),
        tmp.setDate(tmp.getDate() - 1),
        dateTimeFormat.format(tmp)
      )]: 'igår',
      [dateTimeFormat.format(new Date())]: 'idag',
      [(
        (tmp = new Date()),
        tmp.setDate(tmp.getDate() + 1),
        dateTimeFormat.format(tmp)
      )]: 'imorgon',
      [(
        (tmp = new Date()),
        tmp.setDate(tmp.getDate() + 2),
        dateTimeFormat.format(tmp)
      )]: 'i övermorgon'
    }[dateString.slice(0, 10)] || null
  );
}
