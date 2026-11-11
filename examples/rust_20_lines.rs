// gemini-4-argon — 20-line Rust demo (fits the sandbox's 20-line output pane)
// Run: the chat "▶ Run" button, or `rustc demo.rs -o demo && ./demo`
fn primes(limit: usize) -> Vec<usize> {
    let mut is_prime = vec![true; limit + 1];
    is_prime[0] = false;
    if limit >= 1 { is_prime[1] = false; }
    let mut p = 2;
    while p * p <= limit {
        if is_prime[p] {
            let mut m = p * p;
            while m <= limit { is_prime[m] = false; m += p; }
        }
        p += 1;
    }
    (0..=limit).filter(|&i| is_prime[i]).collect()
}
fn main() {
    let found = primes(100);
    println!("primes <= 100 ({}): {:?}", found.len(), found);
    assert_eq!(found.len(), 25);
    println!("20 lines of Rust — all tests passed ✔");
}
