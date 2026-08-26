# Homebrew formula template. sha256 values are zeros until the first signed
# GitHub Release; `brew install` from this file will fail checksum until CI
# replaces them. See docs/RELEASING.md.
class Purser < Formula
  desc "The purser for your coding agents"
  homepage "https://purser.sh"
  version "0.0.1"
  license "SEE LICENSE IN LICENSE"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/purser-sh/purser/releases/download/v#{version}/purser-darwin-arm64"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    else
      url "https://github.com/purser-sh/purser/releases/download/v#{version}/purser-darwin-x64"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    end
  end

  on_linux do
    if Hardware::CPU.intel?
      url "https://github.com/purser-sh/purser/releases/download/v#{version}/purser-linux-x64"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    else
      odie "No linux-arm64 binary in this formula yet."
    end
  end

  def install
    bin.install Dir["purser-*"].first => "purser"
  end

  test do
    assert_match "Purser", shell_output("#{bin}/purser --help")
  end
end
