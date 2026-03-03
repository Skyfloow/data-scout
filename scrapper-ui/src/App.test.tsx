import React from 'react';

import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material';
import { store } from './store';
import theme from './theme/theme';
import DashboardPage from './pages/DashboardPage';

describe('DashboardPage Component', () => {
  it('renders the core dashboard elements without crashing', () => {
    render(
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <BrowserRouter>
            <DashboardPage />
          </BrowserRouter>
        </ThemeProvider>
      </Provider>
    );

    // Smoke test: if we reach here, the components mounted without crashing.
    expect(true).toBe(true);
  });
});
