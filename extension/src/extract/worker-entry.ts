import {runWebImportJob} from './worker';
const id=new URLSearchParams(location.search).get('jobId');
void chrome.tabs.getCurrent().then(tab=>{if(id&&tab?.id)return runWebImportJob(id,tab.id);});
