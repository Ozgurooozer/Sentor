#!/bin/bash

# ============================================
# Claude Code — Interface Design Global Kurulum
# ============================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${BLUE}Claude Code Altyapı Kurulumu${NC}"
echo "=============================="

# 1. Global .claude klasörü
echo -e "\n${YELLOW}1. Global Claude klasörü hazırlanıyor...${NC}"
mkdir -p ~/.claude
mkdir -p ~/.claude-plugin

# 2. CLAUDE.md global kopyala
echo -e "${YELLOW}2. CLAUDE.md global kuruluyor...${NC}"
cp .claude/CLAUDE.md ~/.claude/CLAUDE.md
echo -e "   ${GREEN}✓ ~/.claude/CLAUDE.md${NC}"

# 3. interface-design system.md
echo -e "${YELLOW}3. Design system kuruluyor...${NC}"
mkdir -p ~/.interface-design
cp .interface-design/system.md ~/.interface-design/system.md
echo -e "   ${GREEN}✓ ~/.interface-design/system.md${NC}"

# 4. Dammyjay93/interface-design plugin kur (git üzerinden)
echo -e "${YELLOW}4. interface-design plugin indiriliyor...${NC}"
TEMP_DIR=$(mktemp -d)
git clone --depth=1 https://github.com/Dammyjay93/interface-design.git "$TEMP_DIR" 2>/dev/null

if [ -d "$TEMP_DIR/.claude" ]; then
  cp -r "$TEMP_DIR/.claude/." ~/.claude/
  echo -e "   ${GREEN}✓ Plugin skill dosyaları kopyalandı${NC}"
fi

if [ -d "$TEMP_DIR/.claude-plugin" ]; then
  cp -r "$TEMP_DIR/.claude-plugin/." ~/.claude-plugin/
  echo -e "   ${GREEN}✓ Plugin tanımları kopyalandı${NC}"
fi

rm -rf "$TEMP_DIR"

echo ""
echo -e "${GREEN}=============================="
echo -e "Kurulum tamamlandı!"
echo -e "==============================${NC}"
echo ""
echo "Şimdi herhangi bir proje klasöründe:"
echo ""
echo -e "  ${BLUE}claude --dangerously-skip-permissions${NC}"
echo ""
echo "İçine girdikten sonra:"
echo ""
echo -e "  ${BLUE}/interface-design:status${NC}   → sistemi kontrol et"
echo -e "  ${BLUE}/interface-design:init${NC}     → projeyi başlat"
echo ""
