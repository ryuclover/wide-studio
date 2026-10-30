import {installUiLanguage} from '../i18n/interface';
import {render} from 'preact';
import {Extract} from './Extract';
import './assistant.css';
import './extract.css';
render(<Extract/>,document.getElementById('app')!);
installUiLanguage();
