import React, { createContext, useContext, useEffect, useState } from "react";
import { apiEnabled, apiLogin, fetchMe, setAuthToken } from "../lib/api";
import { demoUser, loginGuide } from "../lib/mock-data";

const AuthContext = createContext();

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
    // P1-3: 優先從 HttpOnly Cookie 恢復 session
    if (apiEnabled) {
      fetchMe()
        .then((me) => {
          setUser(me.user || null);
          setIsAuthenticated(true);
        })
        .catch(() => { /* localStorage fallback removed per P1-1 */ })
        .finally(() => setLoading(false));
    } else {
      /* localStorage fallback removed per P1-1 */
      setLoading(false);
    }
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

      // 儲存 token 供後續 API 請求使用
      if (authPayload.token) {
        setAuthToken(authPayload.token);
      }
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
    setAuthToken("");
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
