/* global describe, before, after, it */
const ghost = require('ghostjs').default;
const assert = require('assert');
const superstatic = require('superstatic').server;

describe('snabbtåg', () => {
  const PORT = 3474;
  const url = `http://localhost:${PORT}`;
  let server;

  before(done => {
    const app = superstatic({ port: PORT });
    server = app.listen(done);
  });

  after(() => server.close());

  it('<Stations/> can filter on train number', async () => {
    await ghost.open(url);
    await ghost.waitForElement('a.item-link');

    const getNumberOfStations = async () =>
      (await ghost.findElements('a.item-link')).length;

    const numberOfStationsBefore = await getNumberOfStations();
    await ghost.fill('.searchbar input', 'ytterby');
    assert.equal(await getNumberOfStations(), 1);
    assert.equal(
      await (await ghost.findElement('a.item-link')).text(),
      'Ytterby'
    );

    await ghost.click('.searchbar-clear');
    assert.ok(
      numberOfStationsBefore === (await getNumberOfStations()),
      'Has reset filter'
    );
  });

  it('<Stations/> can navigate to non-popular station', async () => {
    await ghost.open(url);
    await ghost.fill('.searchbar input', 'ytterby');
    const stationListElement = await ghost.findElement('li > a');
    await stationListElement.click();

    const navbarTitle = await ghost.findElement('.navbar .link.center');
    assert.equal(await navbarTitle.text(), 'Ytterby ▾');
  });

  it('<Station/> can use /<sign> shortcut', async () => {
    await ghost.open(`${url}/g`);
    const navbarTitle = await ghost.findElement('.navbar .link.center');
    assert.equal(await navbarTitle.text(), 'Göteborg ▾');
  });

  it('<Station/> can filter on train number', async () => {
    await ghost.open(`${url}/Stockholm`);
    const getNumberOfLoadedListElements = async () =>
      (await ghost.findElements('li > a:not([href="#"])')).length;

    const trainNumber = await (await ghost.waitForElement(
      'li > a:not([href="#"]) .train > div'
    )).text();

    const numberOfTrainsBefore = await getNumberOfLoadedListElements();

    await ghost.fill('.searchbar input', trainNumber);
    const numberOfTrainsAfter = await getNumberOfLoadedListElements();

    assert.ok(
      numberOfTrainsBefore > numberOfTrainsAfter,
      'Has filtered out trains'
    );

    await ghost.click('.searchbar-clear');
    assert.ok(
      numberOfTrainsBefore === (await getNumberOfLoadedListElements()),
      'Has reset filter'
    );
  });

  it('<Station/> can navigate to first train', async () => {
    await ghost.open(`${url}/Stockholm`);

    const trainNumber = await (await ghost.waitForElement(
      'li > a:not([href="#"]) .train > div'
    )).text();

    await (await ghost.waitForElement('li > a:not([href="#"])')).click();
    assert.equal(await ghost.pageTitle(), `Tåg ${trainNumber}`);
  });

  it('<Train/> can use /<train-number> shortcut', async () => {
    await ghost.open(`${url}/10425`);
    assert.ok(
      (await (await ghost.findElement('.navbar .center')).text()).startsWith(
        'Tåg 10425'
      )
    );
    assert.equal(await ghost.pageTitle(), `Tåg 10425`);
  });

  it('<Train/> loads', async () => {
    await ghost.open(`${url}/Stockholm/10425`);
    assert.ok(
      await ghost.waitForElement('.name a:not([href="#"])'),
      'Loads train data'
    );
  });
});
