const superstatic = require('superstatic').server;
const puppeteer = require('puppeteer');

describe('snabbtåg', () => {
  let server, browser, page;
  const getInnerText = async selector =>
    (await page.waitFor(selector)) &&
    page.$eval(selector, el => el.innerText.trim());

  const PORT = 3474;
  const url = `http://localhost:${PORT}`;

  beforeAll(done => {
    const app = superstatic({ port: PORT });
    server = app.listen(done);
  });

  afterAll(() => server.close());

  beforeEach(async () => {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    page = await browser.newPage();
  });

  afterEach(() => {
    browser.close();
  });

  it('<Stations/> can filter on train number', async () => {
    await page.goto(url);
    await page.waitFor('a.item-link');

    const getNumberOfStations = async () =>
      (await page.$$('a.item-link')).length;

    const numberOfStationsBefore = await getNumberOfStations();
    await page.type('.searchbar input', 'ytterby');
    expect(await getNumberOfStations()).toBe(1);
    expect(await getInnerText('a.item-link')).toBe('Ytterby');

    await page.click('.searchbar-clear');
    expect(numberOfStationsBefore).toBe(await getNumberOfStations());
  });

  it('<Stations/> can navigate to non-popular station', async () => {
    await page.goto(url);
    await page.type('.searchbar input', 'ytterby');
    await page.click('li > a');

    expect(await getInnerText('.navbar .link.center')).toBe('Ytterby ▾');
  });

  it('<Station/> can use /<sign> shortcut', async () => {
    await page.goto(`${url}/g`);
    expect(await getInnerText('.navbar .link.center')).toBe('Göteborg ▾');
  });

  it('<Station/> can filter on train number', async () => {
    await page.goto(`${url}/Stockholm`);
    const getNumberOfLoadedListElements = async () =>
      (await page.$$('li > a:not([href="#"])')).length;

    const trainNumber = await getInnerText(
      'li > a:not([href="#"]) .train > div'
    );

    const numberOfTrainsBefore = await getNumberOfLoadedListElements();

    await page.type('.searchbar input', trainNumber);
    const numberOfTrainsAfter = await getNumberOfLoadedListElements();

    expect(numberOfTrainsBefore).toBeGreaterThan(numberOfTrainsAfter);

    await page.click('.searchbar-clear');
    expect(numberOfTrainsBefore).toBe(await getNumberOfLoadedListElements());
  });

  it('<Station/> can navigate to first train', async () => {
    await page.goto(`${url}/Stockholm`);

    const trainNumber = await getInnerText(
      'li > a:not([href="#"]) .train > div'
    );

    await page.click('li > a:not([href="#"])');
    expect(await page.title()).toBe(`Tåg ${trainNumber}`);
  });

  it('<Train/> can use /<train-number> shortcut', async () => {
    await page.goto(`${url}/10425`);
    expect(await getInnerText('.navbar .center')).toEqual(
      expect.stringContaining('Tåg 10425')
    );
  });

  it('<Train/> loads', async () => {
    await page.goto(`${url}/Stockholm/10425`);
    expect(await page.waitFor('.name a:not([href="#"])')).not.toBe(null);
  });
});
