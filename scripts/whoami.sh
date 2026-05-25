#!/bin/bash
echo "當前時間: $(date)"
echo "當前使用者: $(whoami)"
echo "Python 版本: $(python3 --version 2>&1)"
echo "Node 版本: $(node --version 2>&1)"
echo "Claude Code 版本: $(claude --version 2>&1)"
