import React, { createContext, useContext, useState, useEffect } from 'react';
import { configAPI } from '../services/api';

const ConfigContext = createContext();

// Fallback values used while the config is loading or if the API fails
const DEFAULTS = {
  roles: ['super_admin', 'hr_admin', 'manager', 'team_lead', 'employee'],
  employeeStatuses: ['active', 'inactive', 'on_leave', 'terminated', 'probation'],
  genders: ['male', 'female', 'other', 'prefer_not_to_say'],
  employmentTypes: ['full_time', 'part_time', 'contract', 'intern', 'consultant'],
  leaveStatuses: ['pending', 'approved', 'rejected', 'cancelled', 'withdrawn'],
  payrollStatuses: ['draft', 'processing', 'completed', 'cancelled'],
  maritalStatuses: ['single', 'married', 'divorced', 'widowed', 'separated'],
  years: (() => {
    const y = new Date().getFullYear();
    return [y + 1, y, y - 1, y - 2, y - 3];
  })(),
  currencies: ['USD', 'EUR', 'GBP', 'AED', 'SAR', 'PKR', 'INR', 'CAD', 'AUD'],
};

export const ConfigProvider = ({ children }) => {
  const [config, setConfig] = useState(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    configAPI.get()
      .then(res => {
        setConfig(prev => ({ ...prev, ...res.data }));
        setLoaded(true);
      })
      .catch(() => {
        // Use defaults on failure — don't block the app
        setLoaded(true);
      });
  }, []);

  return (
    <ConfigContext.Provider value={{ ...config, loaded }}>
      {children}
    </ConfigContext.Provider>
  );
};

export const useConfig = () => useContext(ConfigContext);
