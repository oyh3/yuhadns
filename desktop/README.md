# YuhaDNS Desktop Client

로컬 DNS-over-HTTPS (DoH) 프록시 클라이언트입니다.
`https://dns.ohyh2016.workers.dev/`와 직접 통신하며, 원클릭 Root CA SSL 인증서 자동 등록 기능을 제공합니다.

---

## 🚀 빠른 시작

외부 패키지 설치 없이 **Python 3 표준 라이브러리**만으로 동작합니다.

### 1. GUI 실행 (기본)
```bash
# Windows (cmd 또는 PowerShell)
python main.py

# macOS / Linux (포트 53 바인딩 및 DNS 제어를 위해 권한 필요 시 sudo 권장)
sudo python3 main.py
```

### 2. 터미널 CLI 모드 실행
```bash
# 기본 DoH 주소로 실행
sudo python3 main.py --cli

# 프로필/포트 지정 실행
sudo python3 main.py --cli --url https://dns.ohyh2016.workers.dev/dns-query/fastdns --port 53
```

### 3. SSL Root CA 인증서 원클릭 설치
GUI 화면에서 **[🔒 SSL Root CA 인증서 자동 설치]** 버튼을 누르거나, 명령줄에서 즉시 설치할 수 있습니다:
```bash
# Windows
python main.py --install-cert

# macOS / Linux
sudo python3 main.py --install-cert
```

---

## 🌟 주요 기능

1. **간결한 인터페이스**:
   - 연결/해제 토글 버튼 (CONNECT / DISCONNECT)
   - 실시간 보호 상태 표시 (PROTECTED / DISCONNECTED)
   - 실시간 쿼리 카운터 및 DNS 요청 로그 스트림
2. **사전 정의된 DNS 프로필**:
   - `기본 (All)`: `https://dns.ohyh2016.workers.dev/dns-query`
   - `고속 DNS (FastDNS)`: `https://dns.ohyh2016.workers.dev/dns-query/fastdns`
   - `광고 차단 (Ads)`: `https://dns.ohyh2016.workers.dev/dns-query/ads`
   - `보안 강화 (Security)`: `https://dns.ohyh2016.workers.dev/dns-query/security`
   - `가족 보호 (Family)`: `https://dns.ohyh2016.workers.dev/dns-query/family`
   - 사용자 정의 URL 직접 입력 지원
3. **OS별 시스템 DNS 자동 전환**:
   - 연결 시 시스템 DNS를 `127.0.0.1`로 자동 변경하고, 해제 시 원래 네트워크 설정(DHCP 등)으로 복원합니다.
4. **SSL Root CA 자동 설치**:
   - `.yuha`, `.yu`, `.comm`, `.yh` 등 커스텀 가상 TLD 접속 시 SSL 경고 없이 HTTPS를 사용할 수 있도록 OS 신뢰 저장소에 `ca.crt`를 자동 등록합니다.
   - **Windows**: `certutil` 및 PowerShell `Import-Certificate`
   - **macOS**: `security add-trusted-cert` (키체인 등록)
   - **Linux**: `/usr/local/share/ca-certificates` 또는 `/etc/pki/ca-trust` 업데이트

---

## 📂 파일 구성
- `main.py`: 데스크톱 앱 메인 실행 파일 (GUI / CLI 겸용)
- `ca.crt`: YuhaDNS Root CA 공개 인증서
- `test_dns.py`: DNS 파서 및 로컬 프록시 자체 점검 단위 테스트
- `README.md`: 사용 설명서
