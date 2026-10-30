import {installUiLanguage} from '../i18n/interface';
import { render } from 'preact';
import { AssistantPanel } from './AssistantPanel';
import './assistant.css';
render(<AssistantPanel />, document.getElementById('app')!);
installUiLanguage();
