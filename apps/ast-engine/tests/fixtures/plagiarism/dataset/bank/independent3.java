import java.util.HashMap;
import java.util.Map;

public class Bank {
    private final Map<String, Double> balances = new HashMap<>();

    public void open(String name, double initial) {
        balances.put(name, initial);
    }

    public void deposit(String name, double amount) {
        double current = balances.getOrDefault(name, 0.0);
        if (amount <= 0) {
            System.out.println("Rejected deposit");
            return;
        }
        balances.put(name, current + amount);
    }

    public boolean withdraw(String name, double amount) {
        Double current = balances.get(name);
        if (current == null || amount > current) {
            return false;
        }
        balances.put(name, current - amount);
        return true;
    }

    public boolean transfer(String from, String to, double amount) {
        if (!balances.containsKey(to)) {
            return false;
        }
        if (!withdraw(from, amount)) {
            return false;
        }
        deposit(to, amount);
        return true;
    }

    public void interest(double percent) {
        for (Map.Entry<String, Double> e : balances.entrySet()) {
            e.setValue(e.getValue() * (1 + percent / 100));
        }
    }

    public void report() {
        for (String name : balances.keySet()) {
            System.out.println(name + ": " + balances.get(name));
        }
    }

    public static void main(String[] args) {
        Bank bank = new Bank();
        bank.open("An", 1000);
        bank.open("Binh", 500);
        bank.deposit("An", 250);
        bank.transfer("An", "Binh", 300);
        bank.interest(5);
        bank.report();
    }
}
