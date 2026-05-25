import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { apiEnabled, apiLogin, apiLogout, fetchMe, setAuthToken, getStoredUser, setStoredUser } from "../lib/api";
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
    // 先從 sessionStorage 恢復 session（秒開，不需網路）
    const storedUser = getStoredUser();
    if (storedUser) {
      setUser(storedUser);
      setIsAuthenticated(true);
    }
    // 背景透過 API 驗證 session 是否仍然有效
    if (apiEnabled) {
      fetchMe()
        .then((me) => {
          if (me.user) {
            setUser(me.user);
            setStoredUser(me.user);
            setIsAuthenticated(true);
          }
        })
        .catch(() => {
          // fetchMe 失敗不影響已恢復的 session（NAS 後端可能無此端點）
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  // 監聽全域 401 事件：API 回 401 時自動登出
  useEffect(() => {
    const handleExpired = () => {
      setIsAuthenticated(false);
      setUser(null);
    };
    window.addEventListener("auth:expired", handleExpired);
    return () => window.removeEventListener("auth:expired", handleExpired);
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

      // 儲存 token 和 user 供後續 API 請求及頁面重整恢復使用
      if (authPayload.token) {
        setAuthToken(authPayload.token);
      }
      if (authPayload.user) {
        setStoredUser(authPayload.user);
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

  const logout = useCallback(async () => {
    await apiLogout();
    setIsAuthenticated(false);
    setUser(null);
  }, []);

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
