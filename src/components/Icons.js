import { h, Component } from 'preact';

export const InfoIcon = () => (
  <svg width="22" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg">
    <g fill-rule="evenodd" fill="#007aff">
      <path d="M42 22c0-11.046-8.954-20-20-20S2 10.954 2 22s8.954 20 20 20 20-8.954 20-20zM0 22C0 9.85 9.85 0 22 0s22 9.85 22 22-9.85 22-22 22S0 34.15 0 22z" />
      <circle cx="22" cy="12" r="3" />
      <path d="M20 17h4v16h-4V17zm-2 16h8v1h-8v-1zm0-16h2v1h-2v-1z" />
    </g>
  </svg>
);

export const LocateIcon = () => (
  <svg width="18" viewBox="0 0 41 50" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M.724 23.196L41 5 24 45V23.196H.724zM10 21.208L37.2 8.92 25.72 35.933V21.208H10z"
      fill-rule="evenodd"
      fill="#007aff"
    />
  </svg>
);

export const FavoriteIcon = ({ active }) => (
  <svg width="22" viewBox="0 0 51 45" xmlns="http://www.w3.org/2000/svg">
    {active ? (
      <path
        d="M25.156 44.736c.102.075.156-.117.156-.117 1.476-1.1 7.757-5.796 9.768-7.637 10.205-9.34 21.444-23.698 11.163-33.17C36.68-5 26.527 4.04 25.156 5.343c-1.37-1.3-11.523-10.34-21.086-1.527-10.28 9.472.957 23.83 11.162 33.17 2.01 1.84 8.293 6.536 9.768 7.634 0 0 .055.19.156.116z"
        fill-rule="evenodd"
        fill="#007aff"
      />
    ) : (
      <path
        d="M25.63 6.063s-10-9-18-3-7 15 0 24 18 16 18 16 11-7 18-16 8-18 0-24-18 3-18 3z"
        stroke="#007aff"
        stroke-width="2"
        fill="none"
      />
    )}
  </svg>
);

export const TrainIcon = () => (
  <svg
    width="25"
    height="25"
    viewBox="0 0 50 50"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M25 50c13.807 0 25-11.193 25-25S38.807 0 25 0 0 11.193 0 25s11.193 25 25 25zm-2.047-17.828v-18.17c0-1.106.888-2.002 2-2.002 1.104 0 2 .902 2 2v18.172l6.54-6.54c.778-.78 2.037-.782 2.824.004.78.78.783 2.045.003 2.825l-9.906 9.907c-.412.412-.958.608-1.498.584-.515.005-1.03-.19-1.424-.583l-9.907-9.906c-.78-.778-.783-2.037.004-2.824.78-.78 2.044-.783 2.824-.003l6.54 6.54z"
      fill="#4cd964"
      fill-rule="evenodd"
    />
  </svg>
);
