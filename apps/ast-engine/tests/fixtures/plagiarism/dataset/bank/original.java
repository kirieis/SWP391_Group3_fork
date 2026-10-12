import java.util.ArrayList;
import java.util.List;

public class BankAccount {
    private final String owner;
    private double balance;
    private final List<String> history = new ArrayList<>();

    public BankAccount(String owner, double initialBalance) {
        this.owner = owner;
        this.balance = initialBalance;
        history.add("OPEN:" + initialBalance);
    }

    public void deposit(double amount) {
        if (amount <= 0) {
            throw new IllegalArgumentException("Amount must be positive");
        }
        balance += amount;
        history.add("DEPOSIT:" + amount);
    }

    public boolean withdraw(double amount) {
        if (amount <= 0 || amount > balance) {
            return false;
        }
        balance -= amount;
        history.add("WITHDRAW:" + amount);
        return true;
    }

    public boolean transferTo(BankAccount target, double amount) {
        if (withdraw(amount)) {
            target.deposit(amount);
            history.add("TRANSFER:" + amount + "->" + target.owner);
            return true;
        }
        return false;
    }

    public void applyInterest(double ratePercent, int years) {
        for (int i = 0; i < years; i++) {
            balance = balance + balance * ratePercent / 100;
        }
        history.add("INTEREST:" + ratePercent);
    }

    public double getBalance() {
        return balance;
    }

    public void printStatement() {
        System.out.println("Owner: " + owner);
        for (String line : history) {
            System.out.println(" - " + line);
        }
        System.out.println("Balance: " + balance);
    }

    public static void main(String[] args) {
        BankAccount a = new BankAccount("An", 1000);
        BankAccount b = new BankAccount("Binh", 500);
        a.deposit(250);
        a.transferTo(b, 300);
        b.applyInterest(5, 2);
        a.printStatement();
        b.printStatement();
    }
}
