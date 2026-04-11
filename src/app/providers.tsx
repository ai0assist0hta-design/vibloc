import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './router';

export function AppProviders() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
