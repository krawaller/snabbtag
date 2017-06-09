import { h } from 'preact';
export default () =>
  <div class="view navbar-through">
    <div class="navbar">
      <div class="navbar-inner hide-when-empty" />
    </div>
    <div class="page">
      <noscript>
        <div class="page-content">
          <div class="card">
            <div class="card-content">
              <div class="card-content-inner">Denna app fungerar dessvärre inte utan javascript :-(</div>
            </div>
          </div>
        </div>
      </noscript>
      <div class="page-content hide-when-empty" />
    </div>
  </div>;
        