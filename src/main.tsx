import { render } from 'preact';
import { App } from './ui/App';
import { startCloud } from './ui/cloudSync';
import { getState, startClock, update } from './ui/store';
import './styles.css';

startClock();
startCloud();
render(<App />, document.getElementById('app')!);

// Dev-only console hook for testing: __zy.update(s => ...). Stripped from production builds.
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__zy = { getState, update };
