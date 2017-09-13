import { h, Component } from 'preact';
export default props => (
  <div class="navbar-through">
    <div class="navbar">
      <div class="navbar-inner">
        <div class="left">
          <a class="back link" href={props.getUrl('stations')}>
            <i class="icon icon-back" />
            <span>Välj...</span>
          </a>
        </div>
        <div class="center sliding">Info</div>
        <div class="right" />
      </div>
    </div>
    <div data-page="core-features" class="page page-on-center">
      <div class="page-content">
        <div class="content-block">
          <p>
            Created by <a href="https://twitter.com/litenjacob">@litenjacob</a>.
            Go to{' '}
            <a href="https://github.com/krawaller/snabbtag">
              https://github.com/krawaller/snabbtag
            </a>{' '}
            for details and to report issues.
          </p>
        </div>
      </div>
    </div>
  </div>
);
