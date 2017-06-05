import { h, Component } from 'preact';
export default () =>
  <div class="navbar-through">
    <div class="navbar">
      <div class="navbar-inner">
        <div class="left">
          <a class="back link" href="/stations">
            <i class="icon icon-back" />
            <span>
              Välj...
            </span>
          </a>
        </div>
        <div class="center sliding">Info</div>
        <div class="right" />
      </div>
    </div>
    <div data-page="core-features" class="page page-on-center">
      <div class="page-content">
        <div class="content-block">
          <p>Bla bla</p>
        </div>
      </div>
    </div>
  </div>;
