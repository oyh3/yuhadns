#!/usr/bin/env python3
"""
Self-check tests for YuhaDNS Intra desktop client.
"""

import os
import socket
import time
import unittest
from main import parse_dns_qname, make_servfail, get_ca_cert_path, DnsProxyServer

class TestYuhaDnsDesktop(unittest.TestCase):
    def test_parse_dns_qname(self):
        # Build raw DNS question packet for "google.com"
        # 12-byte header
        header = b"\x12\x34\x01\x00\x00\x01\x00\x00\x00\x00\x00\x00"
        # \x06google\x03com\x00
        question = b"\x06google\x03com\x00\x00\x01\x00\x01"
        packet = header + question
        self.assertEqual(parse_dns_qname(packet), "google.com")

        # Test "me.yuha"
        packet_yuha = header + b"\x02me\x04yuha\x00\x00\x01\x00\x01"
        self.assertEqual(parse_dns_qname(packet_yuha), "me.yuha")

        # Test empty/malformed
        self.assertEqual(parse_dns_qname(b""), "")
        self.assertEqual(parse_dns_qname(b"\x00" * 8), "")

    def test_make_servfail(self):
        query = b"\xab\xcd\x01\x00\x00\x01\x00\x00\x00\x00\x00\x00\x04test\x00\x00\x01\x00\x01"
        reply = make_servfail(query)
        # Transaction ID must match
        self.assertEqual(reply[:2], b"\xab\xcd")
        # Flags: QR=1 (bit 15), RCODE=2 (bits 0-3) -> 0x8182
        flags = int.from_bytes(reply[2:4], "big")
        self.assertEqual(flags & 0x000F, 2) # RCODE 2
        self.assertTrue(flags & 0x8000)      # Response flag QR=1

    def test_ca_cert_presence(self):
        ca_path = get_ca_cert_path()
        self.assertTrue(os.path.isfile(ca_path), f"CA certificate not found: {ca_path}")
        with open(ca_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("BEGIN CERTIFICATE", content)

    def test_proxy_server_lifecycle(self):
        # Test start and stop on a high port (e.g. 5354)
        queries = []
        def on_q(domain, ms, status):
            queries.append((domain, ms, status))

        proxy = DnsProxyServer(host="127.0.0.1", port=5354, on_query=on_q)
        proxy.start()
        self.assertTrue(proxy.running)

        # Send a dummy UDP packet
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        packet = b"\x11\x22\x01\x00\x00\x01\x00\x00\x00\x00\x00\x00\x04test\x04yuha\x00\x00\x01\x00\x01"
        sock.sendto(packet, ("127.0.0.1", 5354))
        sock.close()

        time.sleep(0.5)
        proxy.stop()
        self.assertFalse(proxy.running)

if __name__ == "__main__":
    unittest.main()
