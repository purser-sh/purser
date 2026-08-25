# Homebrew formula template. sha256 values are zeros until the first signed
# GitHub Release; `brew install` from this file will fail checksum until CI
# replaces them. See docs/RELEASING.md.
class Agentdeck < Formula
  desc "Spend governance for a mixed fleet of coding agents"
  homepage "https://github.com/agentdeck/agentdeck"
  version "0.0.1"
  license "SEE LICENSE IN LICENSE"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/agentdeck/agentdeck/releases/download/v#{version}/agentdeck-darwin-arm64"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    else
      url "https://github.com/agentdeck/agentdeck/releases/download/v#{version}/agentdeck-darwin-x64"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    end
  end

  on_linux do
    if Hardware::CPU.intel?
      url "https://github.com/agentdeck/agentdeck/releases/download/v#{version}/agentdeck-linux-x64"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    else
      odie "No linux-arm64 binary in this formula yet."
    end
  end

  def install
    bin.install Dir["agentdeck-*"].first => "agentdeck"
  end

  test do
    assert_match "AgentDeck", shell_output("#{bin}/agentdeck --help")
  end
end
