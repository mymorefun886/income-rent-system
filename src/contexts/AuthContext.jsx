import React, { createContext, useContext, useEffect, useState } from "react";
import { apiEnabled, apiLogin } from "../lib/api";
import { demoUser, loginGuide } from "../lib/mock-data";

const AuthContext = createContext();
const TOKEN_KEY = "income-local-token";
const USER_KEY = "income-local-user";

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
};

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);

    if (token && storedUser) {
      setIsAuthenticated(true);
      setUser(JSON.parse(storedUser));
    }

    setLoading(false);
  }, []);

  const login = async (username, password) => {
    try {
      let authPayload;

      if (apiEnabled) {
        authPayload = await apiLogin(username, password);
      } else if (
        username === loginGuide.defaultUsername &&
        password === loginGuide.defaultPassword
      ) {
        authPayload = {
          success: true,
          token: "local-demo-token",
          user: demoUser,
          mode: "demo",
        };
      } else {
        return {
          success: false,
          message: "用户名或密码错误，请检查后再试。",
        };
      }

      if (!authPayload.success) {
        return {
          success: false,
          message: authPayload.message || "登录失败，请稍后再试。",
        };
      }

      localStorage.setItem(TOKEN_KEY, authPayload.token);
      localStorage.setItem(USER_KEY, JSON.stringify(authPayload.user));
      setIsAuthenticated(true);
      setUser(authPayload.user);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error.message || "登录失败，请稍后再试。",
      };
    }
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setIsAuthenticated(false);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        user,
        loading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
