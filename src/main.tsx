import { render } from 'preact';
import { App } from './ui/App';
import { startClock } from './ui/store';
import './styles.css';

startClock();
render(<App />, document.getElementById('app')!);
