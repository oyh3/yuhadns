#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "=== [1/4] YuhaDNS Root CA 생성 ==="
# CA 개인키 생성 (4096-bit)
openssl genrsa -out ca.key 4096

# 자체 서명된 Root CA 인증서 생성 (10년 유효)
openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 \
  -config openssl.cnf -extensions v3_ca \
  -out ca.crt

echo "=== [2/4] 와일드카드 서버 개인키 및 CSR 생성 ==="
# 서버 개인키 생성 (2048-bit)
openssl genrsa -out server.key 2048

# 서버 CSR 생성
openssl req -new -key server.key \
  -config openssl.cnf -section server_req \
  -out server.csr

echo "=== [3/4] Root CA로 서버 인증서 서명 ==="
# Root CA로 서버 인증서 발급 (5년 유효, 1825일)
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt -days 1825 -sha256 \
  -extfile openssl.cnf -extensions v3_server

# 서버 인증서 + Root CA 결합 번들 생성
cat server.crt ca.crt > server.bundle.crt

# PKCS#12 (PFX) 파일 생성 (비밀번호 없음: -passout pass:)
openssl pkcs12 -export -out server.pfx \
  -inkey server.key -in server.crt -certfile ca.crt \
  -passout pass:

# 불필요한 임시 CSR 파일 정리
rm -f server.csr ca.srl

echo "=== [4/4] 인증서 발급 완료 ==="
echo "생성된 파일 목록:"
ls -lh ca.key ca.crt server.key server.crt server.bundle.crt server.pfx
