import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Controller from './Controller';
import Host from './Host';
import { isControllerUrl } from './snap';
import './styles.css';

// One page, two roles: the big screen opens it plainly (host); phones open the
// join link from the QR code (`?room=CODE` or `?pin=123456`) and become controllers.
createRoot(document.getElementById('root')!).render(
  <StrictMode>{isControllerUrl() ? <Controller /> : <Host />}</StrictMode>,
);
