import React from 'react';
import { createRoot } from 'react-dom/client';
import Stage from './Stage.jsx';
import Chef from './Chef.jsx';
import Order from './Order.jsx';
import './styles.css';

const path = window.location.pathname;
const Page = path.startsWith('/order') ? Order : path.startsWith('/chef') ? Chef : Stage;
createRoot(document.getElementById('root')).render(<Page />);
