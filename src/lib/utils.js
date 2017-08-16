export function getUrl(
  page,
  {
    station = this.station,
    train = this.train,
    date = this.date,
    favorites = this.favorites,
    favoriteTrafficOnly = this.favoriteTrafficOnly,
    showingDepartures = this.showingDepartures
  } = {}
) {
  const queries = [
    favorites instanceof Set && favorites.size
      ? `favoriter=${Array.from(favorites).join(',')}`
      : '',
    typeof favorites === 'string' ? `favoriter=${favorites}` : '',
    favoriteTrafficOnly ? `favorittrafik=true` : '',
    station && (page === 'stations' || page === 'info')
      ? `station=${station}`
      : '',
    (page === 'stations' || page === 'train' || page === 'info') &&
      !showingDepartures &&
      'typ=ankomster'
  ]
    .filter(Boolean)
    .join('&');

  return `${{
    info: '/info',
    station: `/${station}${showingDepartures ? '' : '/ankomster'}`,
    stations: `/stationer`,
    train: `/${station ? `${station}/` : ''}${train}${date ? `/${date}` : ''}`
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
