import { installMainBridge } from '../bridge/mainBridge';
import { installMarqueeSelection } from './marqueeSelection';
// The first valid handshake negotiates the content script's session.
installMainBridge();
installMarqueeSelection();
