# YuhaDNS 로컬 전용 SSL/TLS 인증서 가이드

`.yuha`, `.yu`, `.comm`, `.yh`, `localhost` 도메인에서 브라우저 및 앱의 **SSL 보안 경고(자체 서명 경고) 없이 안전한 HTTPS 연결**을 사용할 수 있는 로컬 신뢰 인증서입니다.

---

## 📂 파일 구성

| 파일명 | 설명 | 사용처 |
| :--- | :--- | :--- |
| **`ca.crt`** | **YuhaDNS Root CA 공개 인증서** (유효기간 10년) | **OS / 브라우저의 "신뢰할 수 있는 루트 인증 기관"에 1회 등록** |
| `ca.key` | Root CA 개인키 (보안 보관 필요) | 인증서 재발급 시 사용 |
| **`server.crt`** | **와일드카드 서버 인증서** (유효기간 5년) | 로컬 웹 서버 / 백엔드 앱 HTTPS 설정에 등록 |
| **`server.key`** | **서버 개인키** (암호 없음) | 로컬 웹 서버 / 백엔드 앱 HTTPS 설정에 등록 |
| `server.bundle.crt` | 서버 인증서 + Root CA 결합 체인 | Nginx, Caddy 등 체인 인증서가 필요한 서버 |
| `server.pfx` | PKCS#12 포맷 (암호 없음) | Windows IIS, C#, Java 등 PFX 지원 환경 |
| `generate-certs.sh` | 원클릭 인증서 자동 발급 스크립트 | 언제든 도메인을 추가하거나 재발급할 때 실행 |

### 🌐 지원 도메인 (SAN)
- `*.yuha`, `yuha`
- `*.yu`, `yu`
- `*.comm`, `comm`
- `*.yh`, `yh`
- `localhost`, `*.localhost`
- `127.0.0.1`, `::1`

---

## 💻 1단계: OS별 Root CA (`ca.crt`) 신뢰 등록 (최초 1회)

### 🪟 Windows
1. `certs/ca.crt` 파일을 더블 클릭합니다.
2. **[인증서 설치]** 버튼을 클릭합니다.
3. 저장소 위치: **[로컬 컴퓨터]** (또는 현재 사용자) 선택 후 다음.
4. **"모든 인증서를 다음 저장소에 저장"** 선택 ➡️ **[찾아보기]** 클릭.
5. **[신뢰할 수 있는 루트 인증 기관]** 폴더 선택 ➡️ 확인 ➡️ 다음 ➡️ 마침.
6. (보안 경고 창이 뜨면 **[예]** 클릭)

*또는 관리자 권한 PowerShell 명령 한 줄로 설치:*
```powershell
Import-Certificate -FilePath "certs\ca.crt" -CertStoreLocation Cert:\LocalMachine\Root
```

---

### 🍎 macOS
1. `certs/ca.crt` 파일을 더블 클릭하여 **키체인 접근(Keychain Access)** 앱을 엽니다.
2. 키체인: **[시스템]** 또는 **[로그인]**에 인증서를 드래그하여 추가합니다.
3. 추가된 **"YuhaDNS Root CA"**를 더블 클릭하여 상세 창을 엽니다.
4. **[신뢰(Trust)]** 섹션을 펼치고, **"이 인증서 사용 시"** 옵션을 **[항상 신뢰(Always Trust)]**로 변경 후 창을 닫습니다 (관리자 암호 입력).

*또는 터미널 명령 한 줄로 설치:*
```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain certs/ca.crt
```

---

### 🐧 Linux (Ubuntu / Debian)
```bash
sudo cp certs/ca.crt /usr/local/share/ca-certificates/yuhadns-ca.crt
sudo update-ca-certificates
```

---

## 🚀 2단계: 로컬 앱에서 HTTPS 서버 적용 예제

### 1) Node.js (Express / HTTP2)
```javascript
import fs from "fs";
import https from "https";
import express from "express";

const app = express();

app.get("/", (req, res) => {
  res.send("<h1>Hello from https://app.yuha!</h1>");
});

const options = {
  key: fs.readFileSync("./certs/server.key"),
  cert: fs.readFileSync("./certs/server.crt")
};

https.createServer(options, app).listen(443, () => {
  console.log("HTTPS Server running on https://app.yuha:443 or https://localhost:443");
});
```

> **Node.js 클라이언트 fetch 시 Root CA 신뢰 추가:**  
> `NODE_EXTRA_CA_CERTS=/path/to/certs/ca.crt node app.js`

---

### 2) Python (FastAPI / Uvicorn)
```bash
uvicorn main:app --ssl-keyfile certs/server.key --ssl-certfile certs/server.crt --port 443
```

---

### 3) Nginx 설정
```nginx
server {
    listen 443 ssl;
    server_name *.yuha *.comm *.yh localhost;

    ssl_certificate     /path/to/certs/server.bundle.crt;
    ssl_certificate_key /path/to/certs/server.key;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 🔄 인증서 재발급 / 도메인 추가

`certs/openssl.cnf` 파일의 `[ alt_names ]` 섹션에 원하는 도메인/IP를 추가한 뒤 아래 명령을 실행하면 즉시 갱신됩니다:

```bash
cd certs
./generate-certs.sh
```
