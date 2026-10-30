import {installUiLanguage} from '../i18n/interface';
import {render} from 'preact';
import {Drive} from './DriveBrowser';
import './assistant.css';
import './drive.css';
render(<Drive/>,document.getElementById('app')!);
installUiLanguage();
