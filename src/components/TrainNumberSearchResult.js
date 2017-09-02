import { h, Component } from 'preact';
export default class TrainNumberSearchResult extends Component {
  state = {
    resultsBySearchString: {}
  };

  componentDidMount() {
    this.refresh();
  }

  refresh() {
    const { searchString } = this.props;
    this.props.api.fetchAutocompletedTrains(searchString).then(results =>
      this.setState({
        resultsBySearchString: {
          ...this.state.resultsBySearchString,
          [searchString]: results
        }
      })
    );
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevProps.searchString !== this.props.searchString) this.refresh();
  }

  render({ searchString }, { resultsBySearchString }) {
    return (
      <div class="list-group">
        <ul>
          <li class="list-group-title item-links">
            <div class="row">
              <div class="col-15">Tåg</div>
              <div class="col-15 time">Avg</div>
              <div class="col-35">Från</div>
              <div class="col-35">Till</div>
            </div>
          </li>
          {(resultsBySearchString[searchString] || Array.from(new Array(20)))
            .map(({ train, at, from, to } = {}) => {
              return (
                <li>
                  <a
                    href={
                      train
                        ? this.props.getUrl.call(this, 'train', { train })
                        : '#'
                    }
                    class="item-link"
                  >
                    <div class="item-content">
                      <div class="item-inner">
                        <div class="hide-when-empty full-width">
                          {train &&
                            <div class="row">
                              <div class="col-15 name">
                                {train}
                              </div>
                              <div class="col-15 time">
                                {at}
                              </div>
                              <div class="col-35 name item-title">
                                {from}
                              </div>
                              <div class="col-35 name item-title">
                                {to}
                              </div>
                            </div>}
                        </div>
                      </div>
                    </div>
                  </a>
                </li>
              );
            })}
        </ul>
      </div>
    );
  }
}
